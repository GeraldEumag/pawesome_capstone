# 10 — Performance and Reliability

## Backend

| Area | Evidence | Assessment |
| --- | --- | --- |
| N+1 | Eager loading used on hot paths (`ServiceRequest::with('appointment.veterinarian')`, `Pet::with('customer')`); prior audits fixed known N+1s | PASS |
| Indexes | Dedicated `add_report_read_path_indexes` migration (single-purpose, reversible, skips existing); FK indexes from `foreignId`; stock/sales date indexes | PASS |
| Pagination | `paginate`/`limit` used across ~131 controller call sites; no unbounded `->get()` on list endpoints found in spot checks | PASS |
| Concurrency | `lockForUpdate` on POS stock + booking slot checks; `withoutOverlapping` on scheduler; idempotency middleware on mutations; deadlock-free notification ordering (commit `175cb59e`) | PASS |
| Transaction boundaries | Financial + booking mutations wrapped in `DB::transaction` (verified POS, boarding, vet workflows) | PASS |
| Timeouts | Receipt-scan job 120s; `QUEUE_RETRY_AFTER` recommendation in report 07 | PASS w/ note |
| PHP limits | Standard; `php artisan serve` is dev-only — production uses containerized serve or proper FPM behind edge | PASS |

## Frontend

- Production build passes (2392 modules); **one >500 kB chunk warning**
  (pre-existing; route-level `lazy()` already used for heavy report
  components — `AdminReports.jsx` lazy-imports 6 report views;
  `ErrorBoundary` wraps app root + report section).
- Vite `build.outDir=build`; hashed assets → long-cache safe.
- API client centralizes base URL + error handling; Playwright smoke
  verified zero console errors on 8 role dashboards.
- Polling intervals exist on dashboards (noted in AGENTS.md re:
  single-threaded dev server) — normal app behavior; on production
  multi-worker/container this is fine.

## Reliability under failure

| Failure | Behavior | Status |
| --- | --- | --- |
| DB down | API 500s JSON (no traces when debug off); Flysystem errors → 503 JSON | PASS |
| Queue/mail down | Outbox intents persist; dispatch/reconcile retry; business tx unaffected | PASS |
| Storage down | `FilesystemException` → 503 "upload not saved, try again" — explicit, no silent loss | PASS |
| Payment op failure | Transaction rollback; idempotency prevents double-charge on retry | PASS |
| Session/token expiry | Idle timeout (≤60 min) + per-token expiry → clean 401 → frontend re-login | PASS |
| Concurrent booking/inventory | Row locks + overlap checks + idempotency (verified by concurrency tests) | PASS |
| AI/OCR provider down | Receipt scan job retries ×3 then falls back to manual entry | PASS |
| Chatbot AI down | FAQ/rule fallback path; rate-limited spend guards | PASS |

## Not verified / residual

- **Load testing NOT performed** — no k6/Artillery evidence; capacity
  planning is extrapolation. At capstone scale (single clinic, ~100
  users) risk is low; recommend a smoke load test post-deploy.
- Bundle >500 kB chunk — cosmetic; lazy-loading already mitigates.
- `php artisan serve` in `railway.json` is single-process — adequate
  for demo volume; for real production traffic prefer PHP-FPM/nginx or
  multiple replicas behind the platform's router.

**Status: PASS** for expected capstone/clinic load; no verified
defects requiring change.
