# 07 — Queue and Scheduler Activation

## Verified facts (code-level)

- `QUEUE_CONNECTION=database` requires `jobs` + `failed_jobs` tables —
  **both exist** via `0001_01_01_000002_create_jobs_table` migration. ✓
- `DB_QUEUE_RETRY_AFTER` default **150s** > max job timeout **120s**
  (`ProcessReceiptScan`); recommend explicit `180` for headroom.
- `SendEmailDelivery`: tries=1, timeout 30s, `emails` queue — retries
  governed by delivery-row state machine (dedup-safe).
- `ProcessReceiptScan`: tries=3, timeout 120s, backoff [15,60,300]s,
  `receipts` queue; failure → manual-entry fallback (cashier-confirm
  gate preserved).
- Scheduler: `php artisan schedule:work` is already inside
  `railway.json` startCommand — **no separate cron needed on Railway**.
  14 scheduled commands verified (report carried from release audit):
  reminders hourly, email dispatch every minute, reconcile every 10min,
  attendance/payroll/leave/probation daily+monthly, inventory expiries,
  confinement accrual, recalls, chatbot prune, idempotency prune.
- **Do not run `schedule:run` cron AND `schedule:work` simultaneously**
  — would double-execute. Railway path uses `schedule:work` only.

## Activation checklist

| # | Item | Status | Action |
| --- | --- | --- | --- |
| Q-1 | `QUEUE_CONNECTION=database` in env | ⏳ | Set in Railway Variables |
| Q-2 | Queue worker service | ⏳ | Second Railway service (same repo/image): start cmd `php artisan queue:work --queue=emails,receipts,default --sleep=3 --timeout=130` — note `--timeout` must exceed 120s job timeout; or accept default worker timeout (60s? verify — set explicitly) |
| Q-3 | Worker env vars | ⏳ | Same env set as backend (esp. DB_*, MAIL_*) |
| Q-4 | Scheduler | ✅ designed | Already in `railway.json`; verify `schedule:work` loop alive post-deploy via logs |
| Q-5 | Failed-job monitoring | ⏳ | Ops routine: `queue:failed` daily; alert on growth (report 11) |

### Worker command refinement

```
php artisan queue:work database --queue=emails,receipts,default \
  --sleep=3 --timeout=130 --tries=1
```

- `--timeout=130` > 120s receipt-scan timeout.
- `--tries=1` per-job override optional; job-level `$tries` governs.
- `--queue` order: `emails` first (user-facing latency), then
  `receipts`, then `default`.

## Post-deploy verification (blocked until deploy)

- [ ] `jobs` table receives rows after a test email intent
- [ ] Worker log shows processing; `failed_jobs` empty after tests
- [ ] `email-deliveries:dispatch` runs (check `email_deliveries`
      `processed_at` advancing)
- [ ] Scheduler entries fire (e.g., `email-deliveries:reconcile` every
      10 min visible in logs)

**Status: CONFIGURATION READY — activation pending deployment.**
