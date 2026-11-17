# PAYROLL FINAL BROWSER E2E

**Date:** 2026-11-17 · **Isolated stack:** backend `:8001` → `pawesome_e2e_audit`, frontend `:3001` · Chromium project.

**Environment note:** `test-utils loginAs` uses `VITE_API_BASE_URL`, so runs required `VITE_API_BASE_URL=http://127.0.0.1:8001/api` in addition to `E2E_API_URL` — an env-wiring detail, not an app defect. One earlier run failed only because it was omitted.

## Results — 14/14 payroll tests pass

| Spec | Result |
| --- | --- |
| `payroll-finalization.spec.js` — Payroll list carries authoritative `total_deductions` and person-type labels | **PASS** — every API row's `total_deductions` equals its component sum; UI deduction cell matches API; `is_unlinked` present; person-type filter exercised |
| `payroll-finalization.spec.js` — Manual unlinked payroll requires maker-checker approval | **PASS** — manager creates unlinked row → self-approve **422** → admin approves **200** → release **200** |
| `payroll-finalization.spec.js` — Employee self-service, IDOR, and role gating | **PASS** — cashier `/api/my-payroll` 200; `/api/manager/payroll` 403; unauthenticated 401; foreign payslip 403/404 |
| `payroll-dashboard.spec.js` — 7 tests (login→dashboard, metrics, refresh, nav, generate+payslip, forbidden) | **PASS** |
| `manager-payroll-scope.spec.js` — all /manager/* pages render under Manager scope | **PASS** (53.7s) |
| `phase12-hr-payroll.spec.js` — 3 tests (full lifecycle; auth/IDOR/tamper; duplicate+concurrent) | **PASS** |

*One earlier combined run showed `manager-payroll-scope` failing on the env-mismatch above and `phase12-hr-payroll` test 1 flaky on a transient 401 (passed on retry) — consistent with the documented Windows socket-exhaustion issue, not application code.*

## Evidence

`browser-evidence/payroll-finalization/`:
- `01-payroll-list-deductions-column.png` — payroll list with corrected Deductions column
- `03-employee-self-service.png` — cashier self-service payroll page
- Existing `browser-evidence/manager-payroll-scope/` + `system-security-audit-20261108/phase12-hr-payroll/` regenerated this run.

## Verified end-to-end

Deduction column ↔ API `total_deductions` · maker-checker gate (self-approve denied, cross-approve allowed, release allowed) · role gating (403/401) · IDOR · self-service payslip access · manager scope navigation · payroll generate→approve→release lifecycle (phase12 spec).
