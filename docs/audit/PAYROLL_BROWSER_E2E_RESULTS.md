# PAYROLL_BROWSER_E2E_RESULTS.md

**Execution date:** 2026-11-17. **Stacks:**
- Dev stack: frontend `http://127.0.0.1:3000` → backend `http://127.0.0.1:8000` (`pawesome`, read-only specs only)
- Isolated audit stack: frontend `http://127.0.0.1:3001` (`VITE_API_BASE_URL=:8001`) → backend
  `http://127.0.0.1:8001` (`DB_DATABASE=pawesome_e2e_audit`, fresh migrate+seed) — required by the
  spec's own guard `E2E_AUDIT_DATABASE=pawesome_e2e_audit`.

## Results: 11/11 PASS

### `phase12-hr-payroll.spec.js` (isolated audit DB — real writes) — 3/3 ✅

| Test | What it did | Result |
|---|---|---|
| Native HR/payroll lifecycle | seeded attendance via PDO → `POST /manager/payroll/generate` → manager opens real UI at :3001, clicks **Approve** → payslip verified → DB reconciliation of `processed_by/approved_by` + status | ✅ 43.2s — approve attribution to manager verified; payslip amounts = DB |
| Authorization, IDOR, tampering | cashier `POST generate` → **403**; cashier `POST approve` → **403**; approve already-paid → **422**; non-manager release → blocked | ✅ 10.0s |
| Duplicate & concurrent processing | second `generate` same period → no dup; 2× concurrent `generate` → one row set; 2× concurrent `approve` → one logical transition | ✅ 4.1s |

Screenshots: `browser-evidence/system-security-audit-20261108/phase12-hr-payroll/*.png`
(incl. `02-after-approve.png`).

### `payroll-dashboard.spec.js` (dev stack; API-mocked UI flows) — 7/7 ✅

login→manager dashboard redirect · dashboard title · payroll module loads + metrics · refresh
reloads · main nav · generate + payslip flow (route-mocked) · forbidden pages redirect/block.

### `manager-payroll-scope.spec.js` (dev stack, read-only) — 1/1 ✅

All 8 manager pages (`/manager`, `/staff`, `/attendance`, `/leave`, `/schedule`→attendance,
`/payroll`, `/payroll/computation`→`/manager/payroll` redirect, `/reports`) render with non-empty
body and their backing APIs return 200. Screenshots: `browser-evidence/manager-payroll-scope/`.

## Browser-side observations

- **Console/API errors:** spec-level network capture recorded no unexpected 4xx/5xx on manager
  flows; forbidden probes returned expected 403s.
- **Redirect aliases verified in-browser:** `/manager/schedule` → `/manager/attendance`;
  `/manager/payroll/computation` → `/manager/payroll` (computation is a tab, not a page).
- **Post-fix UI:** compute breakdown labels attendance lines "· in gross"; MyPayroll payslip PDF
  lists attendance deductions under an Attendance section and Total Deductions reconciles
  `gross − total = net` (verified via payslip API data + component code path).

## Workflow coverage vs. required steps

| Required step | Status |
|---|---|
| Login as Payroll Manager | ✅ |
| Dashboard / employee mgmt / attendance / payroll pages | ✅ (scope spec) |
| Select period → generate computation → inspect rows | ✅ (phase12 + dashboard) |
| Compare displayed vs expected | ✅ (API-level reconciliation + backend suite) |
| Save/process payroll | ✅ generate→approve→release |
| Verify saved records in DB | ✅ (phase12 PDO reconciliation) |
| Generate/verify payslip | ✅ |
| Payroll history remains correct | ✅ (idempotent regenerate = updateOrCreate, same period) |
| Other-role access denied | ✅ (403s, executed) |

**Not executed:** pixel-diff of printed payslip PDF (structure + data verified instead);
multi-manager simultaneous UI session (API-level concurrency covered instead).
