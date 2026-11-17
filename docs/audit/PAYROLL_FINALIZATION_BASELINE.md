# PAYROLL FINALIZATION BASELINE

**Date:** 2026-11-17
**Scope:** Finalization stage following the completed Payroll Module audit.
**Prior audit docs:** All ten `PAYROLL_*.md` documents under `docs/audit/` were re-read and reconciled.

## Git state

| Item | Value |
| --- | --- |
| Current commit | `39b3c48` — "Merge branch 'main' of https://github.com/GeraldEumag/pawesome_capstone 2026-11-17" |
| Working tree | F-001/F-002/F-003 application fixes + audit docs are **uncommitted** (expected — preserved, not reset/stashed) |
| Untracked new files | `backend/tests/Feature/PayrollAuditDefectReproductionTest.php`, `PayrollFinalizationTest.php`, `docs/audit/PAYROLL_*.md`, `browser-evidence/payroll-finalization/` |

## Environment

| Item | Value |
| --- | --- |
| Backend | Laravel 12.72.0 / PHP 8.2.12 |
| Frontend | React 18 + Vite 6.4.5 |
| Test DB | MySQL `pawesome_test` (phpunit.xml pinned) |
| Dev DB | `pawesome` — read-only this phase |
| E2E DB | `pawesome_e2e_audit` — isolated, backend :8001 / frontend :3001 |

## Previously completed fixes (carried forward, verified still in place)

- **F-001** — attendance deductions removed from `total_deductions` aggregate; they remain inside `gross_pay`. Invariant: `net_pay = gross_pay - total_deductions`.
- **F-002** — `store()` recomputes linked rows server-side (`calculatePayroll(true)`); `gross_pay`/`net_pay` required only for unlinked rows via `required_without_all:user_id,employee_id`.
- **F-003** — `Payroll::boot()` uses `withTrashed()` + `MAX(CAST(SUBSTRING(payroll_id,-4) AS UNSIGNED))`.

## Outstanding items addressed this phase

- **M-01** per-row deduction display → `total_deductions` accessor + frontend priority.
- **M-02** free-text manual payroll → **Option C approved**: maker-checker approval gate.
- **L-03** payroll_id race → unique-constraint retry on `store()` and `generate()`.
- Read-only historical reconciliation on `pawesome`.

## Test counts at baseline (previous audit)

- Payroll suite 92/92; full suite 997 passed / 1 skipped; reproduction 3/3; Playwright 11/11.

## Files modified this phase

- `backend/app/Models/Payroll.php` — `total_deductions` + `is_unlinked` accessors (`$appends`).
- `backend/app/Http/Controllers/Api/PayrollController.php` — `approve()` maker-checker + `approved_by`/`approved_at` stamping; `markAsPaid()` unlinked-approval guard + pending-status gate; `retry()` on `store()` and `generate()`.
- `backend/app/Http/Controllers/Admin/ReportsController.php` — `person_type` classification.
- `frontend/src/components/manager/PayrollManagement.jsx` — `total_deductions` priority, `otherDeductions` split, Manual badge, person-type filter.
- `backend/tests/Feature/PayrollFinalizationTest.php` — new (10 tests).
- `backend/tests/Feature/Phase4InventoryPayslipTest.php` — fixture updated to model an approved unlinked row.
- `frontend/e2e/payroll-finalization.spec.js` — new (3 tests).
