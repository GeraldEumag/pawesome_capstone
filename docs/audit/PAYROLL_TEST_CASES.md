# PAYROLL_TEST_CASES.md

All entries executed. "Result" = actual run output on `pawesome_test` (PHPUnit) or the browser
stacks (Playwright). No entries are claimed on inspection alone.

## 1. Defect reproduction tests (new — `PayrollAuditDefectReproductionTest`)

| TC | Asserts | Pre-fix | Post-fix |
|---|---|---|---|
| `absent_day_is_charged_once_not_twice` | 1 absence → gross 12,000; `total_deductions` 1,108.78; `net` 10,891.22 | **FAIL** — total_deductions 2,108.78 (absence charged twice) | ✅ PASS |
| `manual_payroll_store_recomputes_totals_server_side` | tampered gross 99,999.99 / net 88,888.88 ignored; recomputed gross 13,000 | **FAIL** — persisted 99,999.99 verbatim | ✅ PASS |
| `payroll_id_generation_survives_soft_deleted_rows` | delete PAY-0001 → next create gets fresh id | **FAIL** — `23000 Duplicate 'PAY-2026-0001'` | ✅ PASS |

## 2. Regression suites executed post-fix

| Suite | Result |
|---|---|
| Payroll+Attendance filter (`Payroll|Payslip|Thirteenth|LeavePolicy|Attendance`) | **92/92 PASS**, 923 assertions |
| `PayrollCalculationTest` | statutory, tax, net-consistency, non-account, absence-command |
| `PayrollEndToEndTest` | full lifecycle, own-payslip isolation, manager payslip, duplicate prevention, status rules, release path, payment method, reconciliation |
| `PayrollIndustryTest` | zero-attendance, preview↔generate parity, premium persistence, undertime/incomplete punch, proration, half-day leave, OT tiers, employer shares, non-taxable allowance, loan settle/rollback, payslip line-items |
| `PayrollLeavePolicyAuditTest` | paid/unpaid/overlap/boundary leave ×8 |
| `PayrollYear2026Test` | kiosk→payroll, non-account, all-24-2026-periods, deductions/premiums, persistence, period validation |
| `Phase4InventoryPayslipTest` | release outbox intent, mailable rendering, dedupe, non-manager block, rollback, no-account path |
| `PayrollAuditDefectReproductionTest` | 3/3 |
| **Full backend suite** | **997 passed / 1 skipped / 5060 assertions / 356.71s** — zero regressions |

## 3. Edge cases executed (inside the above suites)

| Case | Behavior verified |
|---|---|
| No attendance for period | auto-absences; gross floors ≥0; net floors ≥0 |
| Incomplete punch | flag, not auto-deducted |
| No salary record | rows with base 0 → zeroed earnings, no crash (suite coverage) |
| Mid-period hire | prorated base |
| Pending/rejected leave | do NOT cover absences |
| Approved paid/unpaid overlap | unpaid wins |
| Leave crossing period boundary | only in-period days counted |
| Holiday unworked/worked; rest-day; night diff; OT tiers | premiums per rules |
| Duplicate generate / concurrent generate / concurrent approve | single row / single transition |
| Approve paid / release non-pending / update paid | 422 / rejected |
| Loan settle on release + rollback on failure | once-only, atomic |
| Employee IDOR payslip | 403 |
| Tampered store totals | recomputed server-side |
| Soft-deleted payroll then create | fresh `payroll_id` |
| Non-semi-monthly period | rejected |
| Non-account employee (Employee model) | full compute via `employee_id` path |

## 4. Manual/structural checks executed

`php artisan route:list` (18 payroll routes) · `migrate:status` (205 Ran) · `php -l` ×6 edited files
· `npm run build` PASS · read-only DB integrity queries (9 checks, all clean) · frontend build
artefact verified.

## 5. Playwright (Phase H summary — detail in PAYROLL_BROWSER_E2E_RESULTS.md)

| Spec | Stack | Result |
|---|---|---|
| `phase12-hr-payroll.spec.js` | :3001/:8001 on `pawesome_e2e_audit` | 3/3 — lifecycle, RBAC/IDOR, concurrency |
| `payroll-dashboard.spec.js` | :3000/:8000 dev | 7/7 — login, dashboard, metrics, refresh, nav, generate+payslip (mocked), forbidden redirects |
| `manager-payroll-scope.spec.js` | :3000/:8000 dev | 1/1 — all 8 manager pages render + APIs 200 + screenshots |

## 6. Gaps / not executed

- UI-level PDF visual diff (payslip PDF is generated client-side via `exportFormalReportPDF`;
  structure verified in code + totals verified via API data — no PDF pixel check).
- True multi-process HTTP race on `store` (unique index verified; residual low-risk window
  documented in DB audit).
- `pawesome` dev DB row-level data audit (restricted per scope — only read-only checks on
  `pawesome_test`; browser writes isolated to `pawesome_e2e_audit`).
