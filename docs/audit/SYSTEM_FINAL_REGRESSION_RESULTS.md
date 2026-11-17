# System Final Regression Results

**Date:** 2026-11-17 — actual executed output, no inferred results.

| Suite | Command | Result |
| --- | --- | --- |
| Full backend | `php artisan test` (MySQL `pawesome_test`) | **1007 passed / 1 skipped / 0 failures** — 5,106 assertions, 322.81s |
| Frontend unit | `npx vitest run` | **9 files / 44 tests pass** (incl. 11 formatter cases) |
| Frontend build | `npm run build` | **PASS** (18.7s; pre-existing chunk-size warning) |
| Focused payroll | `php artisan test --filter=Payroll…` | 36/36 (135 assertions) |
| Playwright battery (13 specs) | isolated `:3001`/`:8001`/`pawesome_e2e_audit` | **38 pass / 1 fail** (post-fix reruns: `phase4-payment-workflow` 7/7, `phase12-inventory-workflow` 3/3); the 1 remaining failure is `phase12-reports-reconciliation` — P3 test-design (month-scope UI vs day-scope API); 0 app defects |
| DB integrity | read-only queries on `pawesome` | all checks = 0 anomalies |
| PHP syntax | `php -l` on edited files | PASS (zero PHP files edited this phase) |

## Failures classified

| Failure | Class | App defect? |
| --- | --- | --- |
| `phase4-payment-workflow` ×7 | ~~Windows `execSync` PHP-binary interpolation~~ **FIXED** — JS-var command construction + `/api` URL normalization; 7/7 pass | No — was test-infra |
| `phase12-reports-reconciliation` CSV total | month-vs-day scope mismatch (export matches displayed data) | No — test-design + missing custom date filter (P3 gap) |
| `phase12-inventory-workflow` discrepancy label | save 200; 5s refresh window exceeded on slow host | No — test-timing |

## Prior fixes re-verified

F-001/002/003, M-01, M-02 payroll fixes — all green inside the 1007-run. Currency consolidation — all green in unit/build/E2E.
