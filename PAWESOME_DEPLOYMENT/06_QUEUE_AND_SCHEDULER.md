# 06 — Queue Worker and Scheduler (Configuration)

Date: 2026-11-28

## Configuration applied

| Item | Value | How |
|---|---|---|
| `QUEUE_CONNECTION` | `database` | `railway variables --set` (was `sync`) |
| `DB_QUEUE_RETRY_AFTER` | `180` | `railway variables --set` — exceeds 120s max job timeout with margin |
| Worker command | `php artisan queue:work database --queue=emails,receipts,default --sleep=3 --timeout=130 --tries=1` | Added to `backend/railway.json` startCommand as supervised `while true` loop (commit `b6fc14d0`) |
| Scheduler | `schedule:work` loop already in startCommand | unchanged — **no second scheduler added** (would double-execute) |

## Design note — CORRECTED post-deploy

The original plan (supervised `queue:work` loop in `railway.json` startCommand, commit `b6fc14d0`) **did not take effect**: the Railway service's dashboard-managed start command overrides `railway.json` and contains no queue loop (verified via `/proc` cmdline inside the container). Replaced by a scheduled drain in `routes/console.php` (`20fe0c53`):

```
queue:work database --queue=emails,receipts,default --stop-when-empty --max-time=55  → everyMinute()->withoutOverlapping()
```

Verified live in deploy logs (`queue:work … DONE` at 11:03). Worst-case job latency ~60s; adequate at current volume. A dedicated worker service remains the upgrade path (requires Railway dashboard — CLI/API cannot mutate service settings).

## Pre-conditions verified

- `jobs`, `failed_jobs`, `job_batches` tables exist in production DB (default migrations; confirmed in backup dump table list).
- Queue priority order `emails,receipts,default` matches mail/receipt job queues.
- `--tries=1` + outbox dedup (`occurrence_key`) means failed sends stay visible in `failed_jobs` rather than silently retrying forever; `email-deliveries:reconcile`/`dispatch` scheduled commands recover stuck intents.

## Live verification

Deferred to post-deploy checks in reports 07/10 (worker process presence, `queue:failed` count, job processing) — cannot be verified until deployment `b6fc14d0` is live.
