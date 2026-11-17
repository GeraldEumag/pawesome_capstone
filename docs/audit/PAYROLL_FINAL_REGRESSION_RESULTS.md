# PAYROLL FINAL REGRESSION RESULTS

**Date:** 2026-11-17 · **Database:** `pawesome_test` (MySQL) · **All runs executed, none inferred.**

## Full backend suite (final, clean)

```
Tests: 1007 passed, 1 skipped (5106 assertions) — Duration ~251s
```

## Focused payroll runs

| Suite | Result | Assertions |
| --- | --- | --- |
| `PayrollFinalizationTest` (new) | 10/10 PASS | 46 |
| `PayrollAuditDefectReproductionTest` | 3/3 PASS | 19 |
| `Phase4InventoryPayslipTest` (updated fixture) | 10/10 PASS | 55 |
| PHP `php -l` on all edited PHP files | PASS | — |

## New/changed regression coverage

| Test | Purpose | Result |
| --- | --- | --- |
| `index_rows_carry_component_sum_total_deductions` | M-01: API row total == component sum, and == gross−net off-floor | PASS |
| `total_deductions_is_true_component_sum_not_gross_minus_net` | M-01 floor edge: total 2000 while gross−net 1000 | PASS |
| `unlinked_row_is_flagged_and_creator_cannot_self_approve` | M-02 self-approve 422 | PASS |
| `different_manager_can_approve_and_release_unlinked_row` | M-02 cross-approve + release | PASS |
| `put_pending_bypass_cannot_release_unlinked_row` | PUT-status bypass blocked | PASS |
| `linked_row_creator_can_still_self_approve` | Gate scoped to unlinked only | PASS |
| `store_recovers_from_payroll_id_collision` | id-thief → UCVE → retry next suffix | PASS |
| `generate_recovers_from_payroll_id_collision` | same on updateOrCreate path | PASS |
| `store_rejects_negative_deduction_values` | tamper probe | PASS |
| `store_ignores_spoofed_status_and_attribution_fields` | tamper probe | PASS |

## Prior defect regression (unchanged)

- F-001: `PayrollIndustryTest`, `PayrollYear2026Test`, `PayrollCalculationTest` — invariant `net_pay = gross_pay − total_deductions` holds.
- F-002: tampered store totals never persist on linked rows.
- F-003: soft-deleted IDs never reused.

## Test-expectation changes made (documented, not masked)

`Phase4InventoryPayslipTest::test_release_without_account_user_sends_no_email` — the fixture created an unlinked `pending` row with no `approved_by` and released it directly. Under M-02 Option C that state is now correctly rejected (422). The fixture was updated to model a properly-approved unlinked row (`processed_by`=creator manager, `approved_by`=different manager, `approved_at` set); the test's original intent — no account → no payslip email intent — is unchanged and still verified.

## Frontend

- `npm run build` — **PASS** (Vite 6.4.5, ~22s). Non-blocking warnings only: mixed static/dynamic imports, 3.6 MB main chunk — pre-existing, out of defect scope.
