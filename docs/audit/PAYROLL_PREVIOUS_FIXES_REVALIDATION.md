# PAYROLL PREVIOUS FIXES REVALIDATION

**Date:** 2026-11-17 — executed against `pawesome_test`.

## F-001 — Attendance deductions charged twice — **VERIFIED STILL FIXED**

- `PayrollComputationService` keeps late/absent/undertime inside `gross_pay` (earned gross) and excludes them from `total_deductions`.
- `Payroll::getTotalDeductionsAttribute()` sums only statutory + tax + manual + loan components — no attendance fields.
- Frontend (`PayrollManagement.jsx`, `PayrollComputation.jsx`, `MyPayroll.jsx`) uses `total_deductions` for the displayed total and keeps attendance lines as informational.
- Invariant holds: `net_pay = gross_pay - total_deductions` (subject to the documented 0-floor, see M-01 doc).

**Business definition recorded:** `gross_pay` = **earned gross after attendance adjustments** (late/absent/undertime reduce earned gross). It is NOT the contractual/unadjusted salary. Attendance lines are informational on payslips, not subtracted twice.

## F-002 — Client-trusted totals — **VERIFIED STILL FIXED**

`POST /api/manager/payroll` with tampered payloads (executed in `PayrollAuditDefectReproductionTest` + `PayrollFinalizationTest` probes):

| Probe | Result |
| --- | --- |
| `gross_pay=99999.99, net_pay=88888.88` on linked user | Server-recomputed; spoofed values not persisted — PASS |
| Negative `deductions`/`salary_loan` | 422 `min:0` validation — PASS |
| Spoofed `status='paid'`, `approved_by`, `processed_by` | Fields ignored; row created `draft` with `processed_by=Auth::id()` — PASS |
| `PUT {status:'pending'}` then release (unlinked) | Blocked — unlinked rows require `approved_by`, which `update()` never writes — PASS |
| `PUT` mass-assign `approved_by`/`processed_by` | Not in `$rules` — cannot be set — PASS |

Unlinked (free-text) rows remain the documented exception where entered totals are trusted by necessity — governed by M-02 Option C gate.

## F-003 — Payroll ID collision after soft delete — **VERIFIED STILL FIXED**

`Payroll::boot()` computes `MAX(numeric suffix)` over `withTrashed()` rows matching `PAY-{YEAR}-%`. Soft-deleted IDs can no longer be reused. Reproduction test (delete → recreate) passes.

## Executed evidence

- `PayrollAuditDefectReproductionTest`: **3 passed / 19 assertions**
- `PayrollFinalizationTest`: **10 passed / 46 assertions**
- Both run on `pawesome_test`, 2026-11-17.
