# Payroll & Currency Regression Report

**Date:** 2026-11-17

## Payroll (re-validated this phase)

| Milestone | Test evidence | Result |
| --- | --- | --- |
| F-001 attendance double-charge | `PayrollAuditDefectReproductionTest::absent day is charged once not twice` | PASS |
| F-002 server-authoritative compute | `manual payroll store recomputes totals server side` + tamper probes | PASS |
| F-003 payroll-ID collision | `store`/`generate recovers from payroll id collision` | PASS |
| M-01 `total_deductions` | component-sum tests incl. net-floor edge | PASS |
| M-02 maker-checker | self-approve 422 → other-manager approve → release; PUT-bypass blocked | PASS |
| Calculations (SSS/PhilHealth/tax/brackets/leave/OT/2026) | `PayrollCalculationTest`, `PayrollIndustryTest`, `PayrollLeavePolicyAuditTest`, `PayrollYear2026Test` | PASS |
| Payslip reconciliation | `payslip reconciles line items` | PASS |
| Permissions | manager/admin only; self-service scoped | PASS |
| Historical integrity | `pawesome` 1 row intact, read-only | PASS |

## Currency (re-validated this phase)

| Check | Evidence | Result |
| --- | --- | --- |
| Single canonical `formatCurrency()` | 64 files/346 call sites; zero residual competing Intl formatters | PASS |
| ₱ rendering | `currency.test.js` 11/11; `en-PH` PHP renders `₱` | PASS |
| Negative `-₱500.00` | unit test + corrected `PaymentApprovals` defect | PASS |
| Thousands separators | `₱1,250.00`, `₱1,234,567.89` tested | PASS |
| No USD anywhere | 0 `USD`/`$`-money hits; E2E DOM asserted on 7 screens | PASS |
| PDF/email/export | `PHP` in jsPDF/thermal = documented glyph exception; Excel `"₱"#,##0.00` | PASS |

**36/36 focused payroll tests + 11/11 formatter tests + 7/7 currency E2E.** No financial records modified.
