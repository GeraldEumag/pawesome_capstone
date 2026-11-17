# PAYROLL_CALCULATION_VALIDATION.md

**Method:** independent expected-value math (computed by hand in this audit + regression tests
in `PayrollAuditDefectReproductionTest`) compared against `PayrollComputationService` output.
All values below were produced by executed tests on `pawesome_test` — none are read from docs alone.

## 1. Authoritative formula (as implemented, post-F-001)

```
dailyRate       = base_salary / 26            (CompanySchedule divisor)
hourlyRate      = employees/users.hourly_rate  OR  base_salary / 208
periodBase      = base_salary / 2             (semi-monthly; prorated for mid-period hires)

attendanceDeds  = absent_days×dailyRate + late_minutes×hourlyRate/60 + undertime hours prorated
premiums        = overtime + night_diff + rest_day + regular_holiday + special_holiday + holiday_OT
grossPay        = periodBase + premiums + bonus + allowances + non_taxable_allowances
                  + commission + other_earnings  −  attendanceDeds          (clamped ≥ 0)

statutory (per cutoff = monthly × 0.5):
  SSS EE        = 5% × salary_credit(5,000–35,000)
  PhilHealth EE = 50% × clamp(5% × base, 500–5,000)
  Pag-IBIG EE   = min(2% × base, 100)
tax             = 2023 BIR semi-monthly bracket on (gross×2 − statutory monthly-equiv)/2 … 
                  (taxable income excludes non-taxable allowances)

totalDeductions = SSS + PhilHealth + Pag-IBIG + tax + other_deductions + salary_loan + cash_advance
                  ⚠ attendance deductions are NOT here — they are already inside grossPay.
netPay          = max(0, grossPay − totalDeductions)     →  net = gross − total  always holds
```

**Why this shape is correct:** charging attendance inside `gross` keeps the tax base equal to
actually-earned income (DOLE/BIR-aligned) and preserves the `net = gross − total_deductions`
invariant consumed by the preview UI, payslip, reports, and tests.

## 2. Independent verification — executed scenarios

| # | Scenario (executed test) | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | 1 absence, ₱26k/mo (reproduction test) | gross 12,000 · total_ded 1,108.78 · **net 10,891.22** | same | ✅ PASS (was 9,891.22 pre-fix) |
| 2 | 11 absences + 45-min late + Jan-1 holiday unworked, ₱26k (PayrollYear2026Test) | gross 2,906.25 · **net 1,881.25** (SSS650+PH325+PI50) | same | ✅ PASS (was 0 pre-fix) |
| 3 | Full attendance, 24 semi-monthly periods of 2026 | `gross − total_deductions = net` each period | holds ×24 | ✅ PASS |
| 4 | Zero attendance → all absences | absent_ded = 12,500.02 (≈13×961.54 for ₱25k), net floors 0 | same | ✅ PASS |
| 5 | Mid-period hire | prorated periodBase by payable days | `is_prorated`, prorated base | ✅ PASS |
| 6 | Half-day leave | fractional paid/absent days | same | ✅ PASS |
| 7 | Approved paid / unpaid / overlapping leave; boundary spans | paid leave not deducted; unpaid deducted; span clipped | same ×7 cases | ✅ PASS (LeavePolicy suite) |
| 8 | Overtime tiers | 1.5× workday · 1.69× rest/special · 2.6× regular holiday | same | ✅ PASS |
| 9 | Rest day 130% · holiday rest 200% · reg-holiday worked 200% · special 130% · reg-holiday unworked 100% | premium fields | same | ✅ PASS (premiums persist on row) |
| 10 | Night differential 10% | +10% hourly × night hours | same | ✅ PASS |
| 11 | Undertime (early checkout) | deduction from early-out hours | same | ✅ PASS |
| 12 | Incomplete punch (missing checkout) | warning flag, not auto-deducted | same | ✅ PASS |
| 13 | Salary loan auto-deduct | installment floored at balance; settles once on release; rolls back on failure | same | ✅ PASS |
| 14 | Employer shares | SSS ER 10%+₱10EC · PH ER 50% · PI ER ₱100 | same | ✅ PASS |
| 15 | Non-taxable allowance | excluded from taxable income | same | ✅ PASS |
| 16 | Non-account employee (Employee w/o login) | same computation via `employee_id` path | same | ✅ PASS |
| 17 | Payslip reconciliation | `sum(deduction lines excl. attendance) = total_deductions`; `gross − total = net` | holds | ✅ PASS |
| 18 | Late deduction | 45 min past 15-min grace × ₱125/hr ÷60 = ₱93.75 | 93.75 | ✅ PASS |
| 19 | Manual store with tampered totals | server recompute: gross=13,000 not 99,999.99 | 13,000 | ✅ PASS (F-002) |
| 20 | Manual update | recompute via `calculatePayroll(true)` | recomputed | ✅ PASS |

## 3. Double-charge defect — before/after (executed)

| Metric | Before fix | After fix |
|---|---|---|
| `total_deductions` (scenario 1) | 2,108.78 (incl. ₱1,000 absence twice) | 1,108.78 |
| `net_pay` | 9,891.22 | 10,891.22 |
| `net = gross − total` invariant | held but double-charged | holds, single charge |

## 4. Rounding & precision

PHP-side rounding: `round(..., 2)` at field boundaries; service uses float math (acceptable at
this scale — tests assert ±0.01–0.05 deltas). JS preview is display-only (F-002 fix removed the
last path where client math could persist). No `float` → money drift found in executed checks
(`net − (gross − Σded) > 1` query returned 0 rows).

## 5. Statutory effective-date note

Implemented: SSS 5%/10% split + ₱10 EC (2025 table MSC ₱5k–35k), PhilHealth 5% ₱500–5,000,
Pag-IBIG 2% capped ₱100, 2023-onward BIR brackets. These are **configured in code constants** —
documented business rules, not hardcoded per-employee figures. Any future statutory change is a
single-point edit in `PayrollComputationService` (documented, not a defect).
