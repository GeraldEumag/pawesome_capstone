# System Finalization Baseline

**Date:** 2026-11-17 · **Phase 0 evidence — actual commands executed**

## Repository

| Item | Value |
| --- | --- |
| Branch | `main` |
| HEAD | `39b3c48` |
| Working tree | **63 modified, 44 untracked** — all from the payroll finalization + currency standardization phases (none discarded) |
| Untracked of note | `backend/tests/Feature/PayrollAuditDefectReproductionTest.php`, `PayrollFinalizationTest.php`, `frontend/e2e/currency-standardization.spec.js`, `docs/audit/*` (payroll + currency), `browser-evidence/*`, `capstone-deliverables/` |

## Stack

- Laravel 12 / PHP 8.2.12, React 18 + Vite, MySQL (XAMPP)
- **727 routes, 184 migrations, 76 models, 90 Playwright specs, 73 prior audit docs**

## Environment separation (verified)

| DB | Used for | Protection |
| --- | --- | --- |
| `pawesome` | Development (`.env`) | Read-only queries only — never mutated by tests |
| `pawesome_test` | `php artisan test` (pinned by `phpunit.xml`) | disposable |
| `pawesome_e2e_audit` | Playwright via `:8001` backend + `:3001` frontend | isolated |

Other `pawesome_*` DBs present: `pawesome_backend_triage_20260924`, `pawesome_devin_test_20260924`, `pawesome_e2e_devin_20260924`, `pawesome_integration_test_20261020`, `pawesome_payroll_race_*` — legacy audit artifacts, not touched.

- `.env`: `APP_ENV=local`, `APP_DEBUG=true`, `DB=pawesome`, `MAIL_MAILER=smtp`, `QUEUE_CONNECTION=sync`
- `phpunit.xml` pins `DB_DATABASE=pawesome_test`
- Isolated stack confirmed live: backend `http://127.0.0.1:8001` (200), frontend `http://127.0.0.1:3001` (200)

## Preserved prior work (re-validated, not re-derived)

- Payroll: F-001/002/003, M-01, M-02 — tests in `PayrollAuditDefectReproductionTest` + `PayrollFinalizationTest`
- Currency: `formatCurrency()` consolidation, ~40 files, `src/utils/currency.test.js` (11 cases)
- No `git reset/checkout . /clean/stash/pull` executed; no destructive DB commands; no production credentials touched.

## Prior audit corpus reused

`WORKFLOW_INTEGRITY_MATRIX`, `ROLE_PERMISSION_SECURITY_MATRIX`, `IDOR_AND_ACCESS_CONTROL_AUDIT`, `EMAIL_DELIVERY_AUDIT`, `DATABASE_INTEGRITY_AUDIT`, `PRODUCTION_READINESS_AUDIT`, `SYSTEM_ARCHITECTURE_AUDIT`, `SECURITY_FINDINGS`, `FULL_E2E_TEST_RESULTS`, `PHASE6_MANUSCRIPT_ALIGNMENT`, payroll `PAYROLL_*` series, currency `CURRENCY_*` series.
