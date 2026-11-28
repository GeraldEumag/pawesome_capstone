# 12 — Production Operations Runbook

**Pawesome · Laravel API on Railway + MySQL · React on Vercel**
URLs: frontend `https://pawesome-iota.vercel.app` ·
API `https://pawesome-production-c73a.up.railway.app/api`

---

## 1. Daily operations (≈10 min)

| # | Check | How | Healthy looks like |
|---|---|---|---|
| 1 | App availability | Open frontend; `curl https://pawesome-production-c73a.up.railway.app/api/health` | 200 `{"status":"ok"}` |
| 2 | Failed jobs | Railway shell → `php artisan queue:failed` (or `SELECT * FROM failed_jobs`) | empty |
| 3 | Email failures | `SELECT status,COUNT(*) FROM email_deliveries GROUP BY status` | no `failed`/`unknown` growth; `pending` ≈ 0 |
| 4 | Backup ran | `ls storage/app/backups/manifests/` — newest file dated today (19:00 UTC run) | manifest exists, `"status":"ok"` |
| 5 | Critical errors | `tail storage/logs/laravel.log` + Railway deploy logs | no new stack traces |
| 6 | Queue drain | deploy logs show `queue:work … DONE` every minute | recurring |

One-liner for 3+4 (Railway shell):
```bash
php artisan tinker --execute='print_r(DB::table("email_deliveries")->select("status",DB::raw("count(*) c"))->groupBy("status")->get()->toArray());'
ls -t storage/app/backups/manifests/ | head -1
```

## 2. Weekly operations

- **Storage capacity:** `df -h /app/storage/app` in Railway shell — volume is
  434 MB; alert if > 80%. Pet photos/payment proofs grow slowly.
- **Queue performance:** `jobs`/`failed_jobs` counts; note drain cycle time
  in logs.
- **Email metrics:** delivery status mix; bounce/complaint counts; pending
  oldest age (`SELECT MIN(created_at) FROM email_deliveries WHERE status='pending'`).
- **Security:** review `email_suppressions` growth, failed webhook auth
  (401s in logs), new admin users.
- **Backup retention:** confirm manifests older than 30 days are pruned;
  confirm at least 7 daily sets exist.

## 3. Monthly operations

- **Restore verification:** pick latest backup, restore into a scratch DB
  (see §5), compare row counts — NEVER over production.
- **Dependencies:** `composer audit` in `backend/`; `npm audit` in
  `frontend/`; apply patch updates, run suite, deploy via git push.
- **Access review:** Railway/Vercel team members, Brevo users, admin-role
  accounts in `users` table.
- **Costs:** Railway usage (services, volume GB), Vercel bandwidth,
  Brevo send quota.
- **Incidents:** review `laravel.log` + Railway logs for the month; note
  patterns in `PAWESOME_OPERATIONS/`.

## 4. Incident response

### Frontend unavailable
1. Check `https://pawesome-iota.vercel.app` — if Vercel-wide outage, wait.
2. Vercel dashboard → project `pawesome` → Deployments → check latest
   build status; **rollback**: promote previous deployment (Vercel keeps
   them; instant, no rebuild).
3. If frontend loads but API calls fail → backend issue (§below).

### Backend unavailable
1. `curl …/api/health` — 5xx/timeout?
2. Railway dashboard → service `pawesome` → check latest deployment
   status + crash logs.
3. **Redeploy**: Railway → service → Deployments → Redeploy latest (uses
   same image — fast). Or push an empty commit to trigger CI deploy.
4. Check MySQL service status in same Railway project — app 500s with DB
   errors usually mean MySQL is down/restarting.

### Database connection fails
1. Railway → MySQL service → metrics/restarts. Railway restarts it
automatically; private hostname `mysql.railway.internal` is stable.
2. Verify `DB_*` vars unchanged on the app service (a var edit triggers
   redeploy — check recent deploys).
3. Last resort: `railway connect` won't help app-side; redeploy app.

### Email delivery stops
1. Check `email_deliveries`: growing `pending` = dispatch/queue broken;
   `failed`/`unknown` = provider or payload issue.
2. `php artisan queue:failed`; check `jobs` table not growing.
3. Verify Brevo API key still valid (Brevo dashboard → API keys); check
   `MAIL_*`/`BREVO_*` env unchanged.
4. Manual drain: `php artisan queue:work database --queue=emails,receipts,default --stop-when-empty`
5. Check `email-deliveries:dispatch` ran — scheduler logs.

### Queue jobs accumulate
1. `SELECT COUNT(*) FROM jobs` growing + drain cycles failing in logs →
   check for a poison job: `SELECT * FROM jobs ORDER BY id DESC LIMIT 5`.
2. Manual drain (command above). If a job crashes the worker repeatedly,
   `php artisan queue:clear` is NOT first choice — inspect payload first;
   `queue:flush` destroys jobs (destructive — owner approval).
3. `failed_jobs` review: `php artisan queue:failed`, retry via
   `queue:retry {id}` after fixing cause.

### Storage fills up
1. `df -h` on volume; find growth: `du -sh storage/app/* | sort -h`.
2. `storage/app/backups/` prunes at 30 days automatically; manual prune:
   delete oldest `db/*.sql.gz`+`storage/*.zip`+`manifests/*.json` sets.
3. If uploads grew legitimately → Railway volume upgrade (dashboard).

### Deployment breaks production
1. Railway → previous deployment → **Redeploy/Rollback** to last good
   (`a036fb76`/`20fe0c53` era or newer known-good).
2. Vercel → promote previous frontend deployment if frontend broke.
3. DB migrations are forward-only in prod — `migrate:rollback` is NOT a
   recovery strategy (engagement rule); fix forward or restore backup.

### Credentials exposed
1. Rotate immediately: `railway variables --set` new value → auto-redeploy.
   Priority: `APP_KEY` (rotation invalidates encrypted columns — see §5),
   `BREVO_API_KEY`, `DB_PASSWORD`, `BREVO_WEBHOOK_SECRET` (also update
   Brevo webhook header).
2. If committed to git: remove from history (filter-repo/BFG) + force-push
   is destructive — prefer rotate-first, history-scrub second.
3. Review access logs for misuse window.

### Customer data accidentally modified
1. **Stop writes** if ongoing (maintenance mode: `php artisan down`).
2. Identify scope: `activity_logs`/`audit_logs` tables record actor+action.
3. Restore from latest backup into scratch DB, extract affected rows,
   re-apply surgically — do NOT wholesale-restore over live data.

## 5. Recovery procedures

### Database restore (verified procedure — see report 03)
```bash
# On Railway shell or any MySQL client with the dump:
gunzip -c db/YYYYMMDD-HHMMSS.sql.gz | mysql -h <host> -u <user> -p <db>
# The dump contains DROP TABLE IF EXISTS — it REPLACES all tables.
# ⚠️ Destructive to current data — maintenance mode + owner approval first.
```
Point-in-time note: dump is consistent per-table but not a single
transaction snapshot across tables — take app `down` during restore for
production consistency.

### Storage restore
```bash
unzip storage/YYYYMMDD-HHMMSS.zip -d /tmp/restore   # entries are app/…-rooted
# then copy needed dirs back over storage/app, or full replace in maintenance.
```

### Vercel rollback
Dashboard → Deployments → previous Ready deployment → "Promote to
Production". Instant, no rebuild. Env vars are per-project — a rollback
does NOT revert env changes.

### Railway redeploy / rollback
Deployments → select known-good → Redeploy. Railway keeps images;
redeploy is fast. `railway.json` `preDeploy` runs `migrate --force` on
each deploy — migrations must stay backward-compatible.

### APP_KEY preservation
`APP_KEY` encrypts `email_deliveries` payloads, tokens, etc. **Never
rotate casually** — rotation makes existing ciphertext unreadable.
If leaked: rotate AND plan re-encryption/migration of encrypted columns.
Backups made under old key can't decrypt payloads after rotation.

### Queue recovery
- Stuck `processing` rows auto-reclassify to `unknown` after lock lease
  (~minutes) via `email-deliveries:reconcile` — never auto-resent.
- `unknown` rows: verify with Brevo logs whether send happened, then
  `php artisan email:retry {id} --reconciled` or leave terminal.
- `jobs` table corruption: `queue:clear` only after payload inspection.

### Email reconciliation
After any restore/provider incident:
1. `email-deliveries:reconcile` (or wait for 10-min schedule).
2. Compare `provider_message_id` rows vs Brevo dashboard logs.
3. Webhook replays are safe — terminal statuses never regress.

## 6. Quick command reference (Railway shell)

```bash
php artisan ops:backup                                  # manual backup now
ls -t storage/app/backups/manifests/ | head -3          # latest backups
php artisan queue:failed                                # failed jobs
php artisan queue:work database --queue=emails,receipts,default --stop-when-empty  # manual drain
php artisan email:retry {id} --reconciled               # privileged email retry
php artisan migrate:status                              # migration state
php artisan down / php artisan up                       # maintenance toggle
tail -f storage/logs/laravel.log                        # live app log
```

## 7. Escalation

| Issue | Owner |
|---|---|
| Railway platform outage | Railway status page / support |
| Vercel outage | vercel-status.com |
| Brevo delivery issues | Brevo dashboard logs + status |
| Domain/DNS | whoever owns the domain registrar |
| Code defect | engineering — fix forward via git → CI → deploy |
