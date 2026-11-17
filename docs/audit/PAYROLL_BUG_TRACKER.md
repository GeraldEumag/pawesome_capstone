# PAYROLL_BUG_TRACKER.md

Severity policy per audit spec: Critical+High → fixed (user-authorized); Medium+Low → documented
only. Every fix has an executed reproduction test (fail → pass).

## FIXED — Critical

### F-001 · Attendance deductions charged twice → net_pay understated ⚠ money-loss
- **Symptom (executed):** 1 absence on ₱26k/mo → `total_deductions` 2,108.78 instead of 1,108.78;
  `net_pay` 9,891.22 instead of 10,891.22. Every peso of late/absent/undertime was subtracted
  inside `grossPay` AND again inside `totalDeductions`.
- **Root cause:** `PayrollComputationService::computeFromAttendance` added
  `late+absent+undertime` into `$totalDeductions` after already subtracting them from `grossPay`;
  every consumer formula (`index` summary, `payslip`, `managerPayroll` report, MyPayroll display)
  replicated the same inclusive sum.
- **Fix (chosen model):** attendance adjustments stay inside `gross` (preserves correct tax base);
  `total_deductions` = statutory + tax + manual + loans only → `net = gross − total` holds
  everywhere. Rejected alternative (keep attendance in totals) would break the tax base and the
  invariant.
- **Files:** `PayrollComputationService.php` (formula); `Api\PayrollController@index` summary;
  `PayrollController@payslip` `total_deductions`; `Admin\ReportsController::managerPayroll`
  aggregate + `payrollRow`; `MyPayroll.jsx` (totalDed + PDF rows moved to Attendance section,
  loan/advance rows added); `PayrollComputation.jsx` (breakdown labels "· in gross").
- **Tests updated to correct semantics:** `PayrollIndustryTest::payslip_reconciles_line_items`,
  `PayrollYear2026Test` (net 0 → 1,881.25), `PayrollCalculationTest::net_consistency`.
- **Regression:** `PayrollAuditDefectReproductionTest::absent_day_is_charged_once_not_twice` ✅.

## FIXED — High

### F-002 · `POST /api/manager/payroll` persisted client-supplied totals
- **Symptom (executed):** `POST` with `gross_pay=99,999.99` persisted verbatim — a tampered
  request (or `ManualPayrollModal`'s client-side math) could write arbitrary payroll money values.
- **Root cause:** `store()` wrote validated input straight to `Payroll::create` with no recompute
  (unlike `update()`, which calls `calculatePayroll(true)`).
- **Fix:** `gross_pay`/`net_pay` now `required_without_all:user_id,employee_id` (still required
  for free-text rows which have nothing to recompute from); person-linked rows run
  `calculatePayroll(true)` before save — submitted totals are ignored.
- **File:** `Api\PayrollController.php` (`store`). **Regression:** reproduction test ✅.

### F-003 · `payroll_id` collision after soft-delete → 500 on create
- **Symptom (executed):** delete `PAY-2026-0001` → next create threw
  `23000 Duplicate entry 'PAY-2026-0001'`.
- **Root cause:** `Payroll::boot` used `count()+1` — counts exclude trashed rows but the UNIQUE
  index still holds their `payroll_id`s.
- **Fix:** seq = `MAX(CAST(SUBSTRING(payroll_id,-4) AS UNSIGNED))` over `withTrashed()` + 1.
- **File:** `Models\Payroll.php`. **Regression:** reproduction test ✅.

## RESOLVED — Medium (finalization phase, user-authorized)

### M-01 · Per-row Deductions column understated the true total → **FIXED**
- **Root cause:** row rendered raw `record.deductions` (other-deductions only) while summary/payslip used the real total.
- **Fix:** `Payroll::getTotalDeductionsAttribute()` (component sum — NOT `gross−net`, which under-reports at the net=0 floor; floor edge tested) appended to API payloads; frontend `normalizePayroll` prioritizes it and keeps raw `deductions` as `otherDeductions`.
- **Regression:** `PayrollFinalizationTest` (2 tests) ✅ + Playwright cell↔API check ✅.
- **Docs:** `PAYROLL_M01_DISPLAY_RECONCILIATION.md`.

### M-02 · Free-text manual payroll trusted totals → **Option C implemented (maker-checker)**
- **Decision (user-approved):** keep the feature; require a *different* authorized approver before release — no new role/table/endpoint.
- **Fix:** `is_unlinked` accessor; `approve()` rejects self-approval (422) and stamps `approved_by`/`approved_at`; `markAsPaid()` requires `approved_by` for unlinked rows + `pending` status for all; "· Manual" badge + person-type filter; `person_type` in reports.
- **Regression:** 4 finalization tests + E2E maker-checker test ✅.
- **Docs:** `PAYROLL_M02_FREE_TEXT_POLICY_DECISION.md`.
- **Remaining:** entered totals for unlinked rows are still trusted by necessity — mitigated, not eliminated.

## DOCUMENTED — Low

| ID | Finding | Status |
|---|---|---|
| L-01 | Non-Api `PayrollController` legacy methods (`update`/`processPayment`) unrouted dead code — can write `paid` but unreachable (verified via `route:list`) | DOCUMENTED |
| L-02 | `users.role` enum `payroll` unused — kept per user decision | DOCUMENTED |
| L-03 | Payroll-id race | **FIXED** — `retry(3)` on `store()`+`generate()`, id regenerated per attempt; both collision tests PASS. Residual: >3-way simultaneous race bounded by retry budget — ACCEPTED RESIDUAL RISK |
| L-04 | `ManualPayrollModal` client-side preview | DOCUMENTED — informational only, server recomputes |

## Finalization verification (2026-11-17)

- `PayrollFinalizationTest`: 10/10 ✅ · Reproduction: 3/3 ✅ · Phase4 fixture: 10/10 ✅
- **Full backend suite: 1007 passed / 1 skipped / 0 failures (5106 assertions) ✅**
- Frontend build ✅ · Playwright **14/14** ✅ on `pawesome_e2e_audit` (:8001/:3001)
- Historical reconciliation on `pawesome`: 0 affected records (read-only)
- **No unresolved Critical or High findings; no Medium findings left unmitigated.**

## Status history

| Finding | Previous status | Final status |
| --- | --- | --- |
| F-001 | FIXED | FIXED — VERIFIED |
| F-002 | FIXED | FIXED — VERIFIED |
| F-003 | FIXED | FIXED — VERIFIED |
| M-01 | DOCUMENTED | FIXED — VERIFIED |
| M-02 | DOCUMENTED | IMPLEMENTED (Option C) — VERIFIED |
| L-01 | DOCUMENTED | DOCUMENTED |
| L-02 | DOCUMENTED | DOCUMENTED |
| L-03 | DOCUMENTED | FIXED — ACCEPTED RESIDUAL RISK (retry budget) |
| L-04 | DOCUMENTED | DOCUMENTED |
