# 13 — Production Handover

Date: 2026-11-28 · No secrets included.

## 1–2. URLs

- **Frontend:** https://pawesome-iota.vercel.app (Vercel project `pawesome`, team `llanetageraldrudolph-2990s-projects`)
- **API:** https://pawesome-production-c73a.up.railway.app/api (Railway service `pawesome`, project `pawesome`)

## 3. Hosting architecture

```
Browser → Vercel (React/Vite static, SPA rewrites)
        → Railway service `pawesome` (Laravel 12 / PHP 8.2, php artisan serve :8080)
            ├─ MySQL 9 service (internal mysql.railway.internal:3306, db `railway`)
            ├─ Volume `pawesome-volume` → /app/storage/app (uploads, PDFs)
            ├─ schedule:work loop (14 scheduled commands + queue drain)
            └─ QUEUE_CONNECTION=database (jobs table)
Email → Brevo HTTPS API (MAIL_MAILER=brevo)
```

## 4. Database

Railway MySQL 9, private networking only, volume `mysql-volume`. Pre-deploy backup: `PAWESOME_DEPLOYMENT/evidence/prod_backup_predeploy_20261128_1808.sql` (3.0 MB, verified). Latest migration applied = newest file; `migrate --force` is a no-op today.

## 5–6. Backups & recovery

- **Now:** Railway volume snapshots (manual/dashboard) + proven `mysqldump` restore path.
- **To configure (R1):** scheduled dump → off-site bucket, retention daily×30 / weekly×12 / monthly×12.
- **Restore:** `railway connect` → `mysql … railway < dump.sql`; storage via volume snapshot.

## 7. Queue worker

`QUEUE_CONNECTION=database`, `DB_QUEUE_RETRY_AFTER=180`. No dedicated worker service (dashboard start command is owner-managed). Instead `routes/console.php` schedules `queue:work database --queue=emails,receipts,default --stop-when-empty --max-time=55` every minute inside `schedule:work`. Check backlog: `SELECT COUNT(*) FROM jobs;` / `php artisan queue:failed`.

## 8. Scheduler

`schedule:work` loop inside the web container (dashboard start command). All 14 scheduled commands + queue drain run automatically. Do **not** add a second scheduler.

## 9. Email provider

Brevo REST API. Verified `accepted` for verification/reset/booking emails. `BREVO_WEBHOOK_SECRET` unset → set it in Railway env + register webhook in Brevo for delivery-event reconciliation. Sender is a Gmail address — see risk R6.

## 10. Monitoring responsibilities

Assign owner for: daily `queue:failed` + `email_deliveries` failure-class review; weekly backup verification; monthly restore drill. Add external uptime monitor on `/api/health` (R3).

## 11. Incident response

1. Check `/api/health` + Railway deployment status/logs.
2. DB issues → restore from latest verified dump (report 05 procedure).
3. Email backlog → `php artisan email-deliveries:dispatch` / check `jobs` table via `railway ssh`.
4. Bad deploy → Railway dashboard → redeploy previous successful deployment (never `migrate:rollback`).

## 12. Deploy & rollback

- **Deploy:** push to `main` on `production` remote (backend, CI-gated) and `origin` (frontend, auto). Backend deploys run `migrate --force` (currently no-op).
- **Rollback:** Railway dashboard redeploy prior deployment; DB rollback = restore pre-deploy dump. Code rollback does not revert migrations — take a dump before any migration-bearing release.

## 13. Authorized administrators

- Railway: project `pawesome` owner (llanetageraldrudolph account)
- Vercel: team `llanetageraldrudolph-2990s-projects`
- GitHub: `GeraldEumag/pawesome_capstone` + `llanetageraldrudolph-commits/pawesome`
- Brevo: account owning `BREVO_API_KEY` + sender
- App admin: `admin@example.com` (staff role admin)

## 14. Known limitations

- `PUT` with multipart file uploads unsupported by PHP (pet-photo *update* path; create works).
- POS invoice "PDF" is client-side jsPDF; payslip PDF exists only as email attachment on payroll release.
- Queue drain latency up to ~60s; worker shares web container.
- `APP_TIMEZONE` **must stay UTC** (see `config/app.php`); business timezone is hardcoded `Asia/Manila` in `ServiceDurationService::STORE_TIMEZONE`.

## 15. Remaining accepted risks

R1–R6 as listed in report 12 — backups automation, webhook secret, alerting, worker split, smoke-test residue, sender domain auth.
