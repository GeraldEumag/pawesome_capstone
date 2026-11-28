# 07 — Queue Worker Reliability

**Status:** PASS (current design) — dedicated worker = ACCEPTED RISK / optional upgrade
**Date:** 2026-11-28

## Current architecture (verified)

Railway's dashboard-managed start command overrides `railway.json`, so no
long-running `queue:work` daemon exists. Instead the scheduler drains the
`database` queue every minute:

```
schedule:work (always-on in container)
  └─ every minute: queue:work database
       --queue=emails,receipts,default
       --stop-when-empty --max-time=55
       withoutOverlapping
  └─ every minute: email-deliveries:dispatch
  └─ every 10 min:  email-deliveries:reconcile
```

Observed live in deploy logs (`queue:work … DONE`) and DB state:
`jobs=0`, `failed_jobs=0` after processing the deployment backlog.

## Safety analysis — why the drain is reliable here

| Property | Evidence |
|---|---|
| Job timeout < retry_after | `SendEmailDelivery::$timeout=30` ≪ `DB_QUEUE_RETRY_AFTER=180` ✅ |
| Tries | `tries=1` — retries are owned by the `email_deliveries` row (`next_attempt_at` backoff via `handleFailure`), not the queue — prevents double-send ambiguity ✅ |
| Crash safety | `send()` atomically claims pending→processing; stale processing rows → `unknown` after lock lease, **never auto-resent** (requires `--reconciled`) ✅ |
| Concurrent workers | Claim is a conditional `UPDATE … WHERE status=pending` — two workers cannot both send ✅ (scheduled drain + future dedicated worker can coexist safely) |
| Failure capture | All throwables caught in `send()` → `handleFailure` classifies (retryable vs terminal); jobs essentially never reach `failed_jobs` from the send path ✅ |
| Queue priorities | `emails,receipts,default` order preserved in drain command ✅ |
| Pileup prevention | `--stop-when-empty --max-time=55` + `withoutOverlapping` ✅ |

## Latency cost

Worst-case email latency ≈ dispatch tick (≤60 s) + drain tick (≤60 s) +
send — typically **1–2 minutes**. For transactional auth/booking email this
is acceptable; it is NOT suitable for real-time chat/notifications (none
exist — chatbot is synchronous HTTP).

## Load evidence

- Lifetime deliveries: 441 rows; peak observed burst: 12 jobs during
  deployment smoke tests — drained in one cycle.
- Current `jobs`/`failed_jobs`: 0/0.
- No traffic pattern suggests queue saturation.

## Dedicated-worker evaluation

Recommended command (from spec):
`php artisan queue:work database --queue=emails,receipts,default --sleep=3 --timeout=130 --tries=1`

**Verdict: NOT NEEDED YET — documented upgrade path.**

Reasoning:
- Railway start command is dashboard-managed; a second service would need a
  new Railway service sharing the same DB/volume — real cost + config for
  ~zero current benefit.
- The scheduled drain already provides correctness (atomic claims,
  reconcile, no double-send). The only gain is latency (~60 s → ~3 s) and
  isolation from web-container CPU contention.
- `tries=1` in the recommended command matches job semantics; keep
  `--timeout=130 < DB_QUEUE_RETRY_AFTER=180` if adopted.

**Trigger to revisit:** sustained `jobs` backlog > 50, email latency
complaints, or traffic growth > ~10× current. When adopted: run the worker
as a separate Railway service on the same private network, KEEP the
scheduled drain as fallback (they cannot double-process — atomic claims),
then optionally remove the drain.

## Verification performed

- Live drain observed in Railway deploy logs (multiple `DONE` cycles).
- Post-deploy backlog (12 jobs) fully drained → `jobs=0 failed_jobs=0`.
- Code audit of claim/send/reconcile/retry paths (this report).
- Timeout/retry-after arithmetic verified against `config/queue.php`.

## Gaps

- No metric on queue wait time (would need instrumentation — low value at
  current scale).
- If the scheduler itself stops (`schedule:work` crash), BOTH dispatch and
  drain stop — covered by uptime monitoring alerting on app health +
  daily ops review of `email_deliveries` pending count.
