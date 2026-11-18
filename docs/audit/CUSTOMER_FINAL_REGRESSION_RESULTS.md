# Customer Role — Final Regression Results (Phase 11)

**Date:** 2026-11-18. Exact commands + outcomes; nothing unexecuted is claimed.

## Executed this finalization session

| Command | Target | Result |
| --- | --- | --- |
| `php artisan test --filter="Customer\|Payment\|Booking\|Boarding\|WalkIn\|Private"` (DB=pawesome_test) | backend | **291/291 pass, 1338 assertions** (earlier this session) |
| `npm run test:unit` (vitest) | frontend | **44/44 pass** (9 files, 43s) |
| `npm run build` (vite) | frontend | **exit 0** (58.6s; pre-existing chunk-size warnings only) |
| `npx playwright test e2e/customer-* --workers=2` | audit stack | 36 pass / 1 socket-timeout / 3 serial-skipped |
| `npx playwright test e2e/customer-bookings-board.spec.js --workers=1` | audit stack | **6/6 pass** — flake confirmed environmental |
| Live API probes (auth/IDOR/role/store-410/chain SR11) | audit API :8001 | all expected statuses; DB-verified |
| Integrity SQL suite (orphans/statuses/dups/overlap) | audit DB | all clean (1 capacity-legal reservation pair) |
| Migration static scan (jsonb/generated/collation/sql_mode) | repo | 0 incompatible constructs |

## Carried-forward baseline results (still valid — re-verified live where applicable)

- Backend customer baseline: 133/133 earlier + the expanded 291/291 above.
- E2E baseline: 52/52 post CUST-H01.
- Gate-2 security matrix: re-probed subset this session — unchanged.
- Phase 13 authorization matrix: 784 probes, 0 violations (prior evidence).
- Phase 13 MySQL-8 strict-mode sim: 916/1/1 (prior evidence).

## Not executed (explicitly disclosed)

- Full `php artisan test` unfiltered suite — customer-scoped filter run instead; no app code changed since, and full-suite signal exists from prior audits.
- Gate B/C/D maintenance scripts — still bootstrap dev `.env`; not re-run per safety checkpoint (equivalent coverage via direct DB-verified probes).
- Real MySQL 8 execution — no Docker/MySQL8 locally; CI gate pending.
- Brevo `delivered_at` webhook confirmation — requires deployed HTTPS endpoint.
