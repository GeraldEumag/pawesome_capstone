# M-01 — PAYROLL DEDUCTION DISPLAY RECONCILIATION

**Status: FIXED & VERIFIED**

## Finding

The PayrollManagement list's **Deductions** column showed only the raw `deductions` column (other/manual deductions), understating the real total while the summary cards and payslip used different formulas.

## Field inventory (traced, not guessed)

`payrolls` columns contributing to actual employee deductions:
`sss_contribution`, `philhealth_contribution`, `pagibig_contribution`, `tax_deduction`, `deductions` (manual/other), `salary_loan`, `cash_advance`.
Attendance fields (`late_deductions`, `absent_deductions`, `undertime_deductions`) are already inside `gross_pay` — **not** part of `total_deductions` (F-001).

Employer shares (`sss_er_share`, `philhealth_er_share`, `pagibig_er_share`) are employer cost, never employee deductions.

## Fix

- **Backend:** `Payroll::getTotalDeductionsAttribute()` — component sum; added to `$appends` so `GET /api/manager/payroll` rows serialize it. No new column.
- **Frontend:** `normalizePayroll` maps `deductions = record.total_deductions ?? record.deductions`; raw `record.deductions` preserved as `otherDeductions` for the payslip line.

## The gross − net edge case (per review requirement)

`total_deductions` is a **component sum**, deliberately NOT `gross_pay - net_pay`: when deductions exceed gross, `net_pay` floors at `max(0, gross - deductions)` and `gross − net` would under-report the true deduction total.

**Executed proof** (`PayrollFinalizationTest::test_total_deductions_is_true_component_sum_not_gross_minus_net`):
gross=1000, deductions component=2000, net floored to 0 → `total_deductions`=2000 while `gross−net`=1000. The list now shows the true 2000.

In the non-floor case both values reconcile (verified by `test_index_rows_carry_component_sum_total_deductions` — gross−net == total_deductions == API payload == UI cell).

## Validation

| Check | Result |
| --- | --- |
| index payload `total_deductions` = component sum | PASS (test + E2E) |
| Floor-edge divergence documented & tested | PASS |
| List cell ↔ API ↔ details ↔ payslip consistent | PASS (Playwright `payroll-finalization.spec.js` test 1 compares UI cell to API) |
| No DB schema change | Confirmed — accessor only |
