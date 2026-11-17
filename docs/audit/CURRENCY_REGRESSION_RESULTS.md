# Currency Regression Results

**Date:** 2026-11-17 — all results are actual executed output.

| Suite | Command | Result |
| --- | --- | --- |
| Formatter unit tests | `npx vitest run src/utils/currency.test.js` | **11/11 pass** |
| Full frontend unit suite | `npx vitest run` | **9 files / 44 tests pass** |
| Frontend build | `npm run build` | **PASS** (28.33s; pre-existing chunk-size warning) |
| Backend payroll tests | `php artisan test --filter="PayrollFinalizationTest\|PayrollCalculationTest\|PayrollAuditDefectReproductionTest\|Phase4InventoryPayslipTest"` | **36/36 pass** (135 assertions) on `pawesome_test` |
| Currency E2E | `playwright test e2e/currency-standardization.spec.js` on `:3001`/`:8001`/`pawesome_e2e_audit` | **7/7 pass** (41.3s) |
| PHP syntax | — | N/A — zero PHP files changed this phase |

## Payroll-fix integrity

F-001 (no double-charge), F-002 (server-authoritative compute), F-003 (ID collision), M-01 (total_deductions), M-02 (maker-checker) — all tests green; the currency work touched display code only and did not alter any calculation.
