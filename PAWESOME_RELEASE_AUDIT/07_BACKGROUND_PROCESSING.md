# 07 — Queue, Scheduler and Background Processing

## Scheduled commands (routes/console.php — all verified present)

| Command | Schedule | Purpose |
| --- | --- | --- |
| `notifications:send-reminders` | hourly, `withoutOverlapping(30)` | Booking reminders; deduped by `reminder_sent_at` |
| `email-deliveries:dispatch` | every minute | Publish outbox intents → `emails` queue |
| `email-deliveries:reconcile` | every 10 min | Repair stale `processing` deliveries |
| `attendance:mark-absent` | daily 23:30 | HR absence marking |
| `payroll:accrue-13th-month` | monthly 16th + last day, 01:00 | Statutory accrual |
| `leave:annual-reset` | yearly Jan 1, 00:05 | Leave balances + SIL conversion |
| `staff:check-probationary` | daily 08:00 | Probation endings |
| `inventory:check-expiries` | daily 07:30 | Batch expiry alerts/flagging |
| `confinement:accrue-daily` | daily 07:45 | Inpatient daily-rate accrual |
| `recalls:send` | daily 08:15 | Vaccine/follow-up recalls |
| `chatbot:prune-logs` | daily | Transcript retention (90d default) |
| `idempotency:prune-keys` | daily | Delete 30-day-old idempotency keys |

Plus **manual/ops commands**: `inventory:reconcile-stock [--apply]`,
`email-deliveries:retry`, `queue:failed`/`queue:retry` (Laravel
standard), evaluation/fixture commands (`Evaluate*`, `Test*` —
dev-only, not scheduled).

## Queue jobs

| Job | Queue | Tries/Timeout/Backoff | Notes |
| --- | --- | --- | --- |
| `SendEmailDelivery` | `emails` | tries=1 (retry via delivery row), 30s | Claim-safe, deduped by `occurrence_key` |
| `ProcessReceiptScan` | `receipts` | tries=3, 120s, backoff [15,60,300]s | AI OCR pipeline; failure → manual entry path; cashier-confirm still required |

Database queue driver → `jobs`/`failed_jobs` tables exist via default
Laravel migrations. `retry_after` should exceed longest job timeout
(120s) — default 90s is **marginal**: recommend `QUEUE_RETRY_AFTER=180`
in production env to avoid premature retry of receipt scans.

## Production startup commands (per architecture)

**Railway (canonical):** `railway.json` already starts
`schedule:work` loop + `artisan serve` in one container.
Queue worker is **NOT** in the start command — if
`QUEUE_CONNECTION=database`, add a second service:
`php artisan queue:work --queue=emails,receipts,default --sleep=3 --tries=1`
(with `--timeout` ≥ job timeouts). With `sync`, no worker needed
(demo mode).

**Hostinger shared (alternative):**
- cron (hPanel, every minute): `php artisan schedule:run`
- queue: must use `QUEUE_CONNECTION=sync` (no worker possible on shared
  hosting) — acceptable for demo scale.

**Generic VPS:**
```
* * * * * cd /path/backend && php artisan schedule:run >> /dev/null 2>&1
# supervisor:
php artisan queue:work --queue=emails,receipts,default
```

## Retry & duplicate-safety assessment

- Email: retry governed by delivery row state machine; `occurrence_key`
  dedup; suppression re-check at send — **safe to retry**.
- Receipt scan: 3 tries with backoff; idempotent per
  `payment_receipts` row (scan writes extraction draft only; payment
  completion is a separate cashier action) — **safe**.
- Scheduler: `withoutOverlapping` on reminders; dispatch/reconcile are
  naturally idempotent (claim semantics).
- Scheduled business commands (payroll accrual, leave reset, absence
  marking) are designed idempotent per period (verified by
  `HrFinanceWorkflowTest` accrual idempotency tests).

## Gaps

- **Worker supervision absent on Railway path** unless second service
  added — documented as deploy decision (report 06).
- `QUEUE_RETRY_AFTER` not in `.env.example` — recommend adding
  `QUEUE_RETRY_AFTER=180` for the 120s receipt-scan timeout.
- No dead-letter alerting — `failed_jobs` requires manual
  `queue:failed` review; recommend a scheduled daily check or admin
  dashboard widget (manual ops task, not code change needed now).
- Dev-only `Test*`/`Evaluate*` commands ship in `app/Console/Commands` —
harmless (not routed/scheduled) but should not be run in production.

**Status: PASS with deploy-configuration actions** (worker decision,
retry_after, failed-job monitoring).
