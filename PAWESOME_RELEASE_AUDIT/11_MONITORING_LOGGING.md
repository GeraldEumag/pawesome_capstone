# 11 — Monitoring, Logging and Observability

## What exists (verified)

| Signal | Mechanism |
| --- | --- |
| App logs | `LOG_CHANNEL=stack`/`single`, `LOG_LEVEL=error` default; `storage/logs/laravel.log`; deprecations channel configurable |
| Login auditing | `login_logs` table — every success/failure with reason; admin repeated-failure alerts (`alertAdminsOnRepeatedFailures`) |
| Activity audit | `activity_logs` table + `Admin\ActivityLogController` (filters/statistics/user views) |
| Email observability | `email_deliveries` state machine (pending/processing/sent/failed) + `Admin\EmailDeliveryController` + suppression list — full delivery forensics |
| Queue failures | Laravel `failed_jobs` table; `queue:failed`/`queue:retry` |
| Health endpoints | `/up` (Laravel), `/api/health` (railway.json healthcheck) |
| Business integrity | `inventory:reconcile-stock` drift report; stock movement ledger |
| Frontend errors | `ErrorBoundary` components; console verified clean in E2E |

## Sensitive-data hygiene in logs

- Bearer tokens never accepted via query string (`ApiTokenAuth`) →
  cannot leak into access logs.
- Passwords/reset tokens stored hashed; plaintext tokens only returned
  once at issuance.
- Email recipients encrypted at rest in `email_deliveries`.
- No `Log::` calls found emitting passwords/tokens/payment secrets in
  spot checks (prior audit + this pass).
- `LOG_LEVEL=error` in production example reduces noise; deprecations
  routed separately.

## Gaps

| Gap | Severity | Recommendation |
| --- | --- | --- |
| Single-file log, no rotation config | Low | Platform log drain or `LOG_STACK=daily` + retention policy |
| No external error monitoring (Sentry/etc.) | Low | Optional; for capstone, platform logs + healthcheck suffice. Do NOT add paid dependency without approval |
| `failed_jobs` needs manual review | Low | Daily ops check or admin widget; document in runbook |
| No uptime monitoring | Medium (ops) | UptimeRobot/BetterStack free tier or platform healthchecks on `/api/health` — owner action |
| Log volume unbounded | Low | `LOG_LEVEL=error` + daily rotation bounds it; monitor disk |
| No alerting on email backlog | Low | `email_deliveries` pending-count check could be a scheduled alert (nice-to-have) |

## Traceability

- Requests carry idempotency keys where mutations occur; activity logs
  attribute actor; `LoginLog` ties auth events to IP/email; email
  deliveries carry `occurrence_key` — an operator can reconstruct any
  business action end-to-end.

**Status: PASS for capstone scale** — sufficient observability exists;
external monitoring/alerting is an owner ops decision, not a code gap.
