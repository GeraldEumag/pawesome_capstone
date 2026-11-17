# PAYROLL FINANCIAL CONSISTENCY & REPORTING

**Date:** 2026-11-17

## Consistency matrix (code-traced + test-verified)

| Surface | Gross | Total deductions | Net | Source |
| --- | --- | --- | --- | --- |
| Payroll list (PayrollManagement) | `gross_pay` | `total_deductions` accessor | `net_pay` | API index |
| Payroll details modal | `gross_pay` | `total_deductions` | `net_pay` | same row |
| Payslip (manager + self-service) | `gross_pay` | statutory + tax + loan + manual sum | `net_pay` | same components |
| Payslip PDF / print | `gross_pay` | same | `net_pay` | same components |
| Payroll report (Admin `ReportsController`) | `gross_pay` | component sum | `net_pay` | corrected in F-001 |
| Summary cards | sums of `gross_pay` | sums of `total_deductions` | sums of `net_pay` | derived |

## Rules verified

1. **Employer vs employee shares** — `sss_er_share`, `philhealth_er_share`, `pagibig_er_share` are excluded from `total_deductions` (checked the accessor — only employee-side components). Employer shares appear only as informational employer-cost lines where displayed.
2. **Attendance adjustments** — `late/absent/undertime` reduce `gross_pay` only; listed on payslips as informational lines, never re-subtracted (F-001).
3. **Floor case** — `net_pay = max(0, gross − deductions)`; `total_deductions` remains the true component sum even when it exceeds `gross − net` (tested).
4. **Loans & cash advances** — `salary_loan` + `cash_advance` included in the component sum once; `loans_settled` flag drives settlement, not deduction math.
5. **13th-month accrual** — separate accrual/pay routes; doesn't feed `total_deductions`.
6. **Paid leave** — shown as paid, not deducted.
7. **`gross_pay` business definition** — earned gross after attendance adjustments (documented; not contractual salary).

## Discrepancy found & resolved

The only inconsistency was M-01 (per-row Deductions column showing raw `deductions` instead of the total) — **fixed** via the accessor + frontend priority. No calculation, persistence, or reporting discrepancy remains; remaining difference is the documented net-floor display edge.

## No change made to

- Statutory computation logic, tax tables, or employer-share math (per constraints — no invented rates).
- Historical stored values.
