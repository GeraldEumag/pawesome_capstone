# PAYROLL_AUDIT_BASELINE.md

**Scope:** Final-stage baseline of the Pawesome Payroll Module (Capstone B audit).
**Date:** 2026-11-17. **Auditor role:** senior engineering team (audit + hardening).

## 1. Environment (verified by execution)

| Item | Verified value | Evidence |
|---|---|---|
| Git branch | `main` (untracked deliverables/docs present; payroll source clean) | `git status` |
| PHP | 8.2.12 | `php artisan about` |
| Laravel | 12.72.0 | `php artisan about` |
| Composer | 2.9.5 | `composer --version` |
| App env | `local`, debug on, UTC | `php artisan about` |
| DB | MySQL listening on 127.0.0.1:3306; `mysql` CLI not on PATH (PDO used for queries) | `netstat`, tinker |
| Test DB | `pawesome_test` (pinned by `phpunit.xml`, MySQL) | AGENTS.md, executed suite |
| Isolated E2E DB | `pawesome_e2e_audit` (created fresh, migrated + seeded, used only by phase12 spec per its own guard) | this audit |
| Backend dev | `http://127.0.0.1:8000` (`.env` → `pawesome`) — up, `/api/health` 200 | curl |
| Audit backend | `http://127.0.0.1:8001` (`DB_DATABASE=pawesome_e2e_audit`) — up, 200 | curl |
| Frontend dev | `http://127.0.0.1:3000` (`VITE_API_BASE_URL=:8000`) — up, 200 | curl |
| Audit frontend | `http://127.0.0.1:3001` (`VITE_API_BASE_URL=:8001`) — up, 200 | curl |

## 2. Executed baseline checks

| Check | Command | Result |
|---|---|---|
| Payroll routes | `php artisan route:list --path=payroll` | 18 payroll routes registered (see API audit) |
| Migrations | `php artisan migrate:status` | All 205 migrations `Ran`, 0 pending — incl. all payroll/attendance migrations |
| PHP syntax (edited files) | `php -l` × 6 | All clean |
| Backend suite (pre-fix) | `php artisan test` | 994 passed / 1 skipped / 5041 assertions / 269.24s |
| Backend suite (post-fix) | `php artisan test` | **997 passed / 1 skipped / 5060 assertions / 356.71s** |
| Payroll-focused suite | `--filter="Payroll|Payslip|Thirteenth|LeavePolicy|Attendance"` | 92 passed / 923 assertions |
| Frontend build | `npm run build` | PASS — built in 39.52s (pre-existing chunk-size/dynamic-import warnings only) |
| DB integrity (pawesome_test) | read-only PDO queries | 0 orphans, 0 duplicate periods, 0 duplicate payroll_ids, 0 net-pay mismatches |

## 3. Working tree state at audit start

Untracked files were limited to deliverables/docs (`capstone-deliverables/`, `docs/`, `browser-evidence/`,
`Chapter5_*.docx/pdf`, `nul`). No stray payroll source modifications. Audit created one new test file
(`backend/tests/Feature/PayrollAuditDefectReproductionTest.php`) and the fix diffs listed in the bug tracker.

## 4. Role model (verified, not assumed)

- `manager` = Payroll Manager (owns staff/attendance/leave/payroll modules under `/manager/*`).
- `admin` = all-staff access (granted by `EnsureRole`); also reaches manager payroll endpoints (`role:manager,admin`).
- `payroll` enum value exists on `users.role` but is **unused** — no seeded account, no routes. Decision: keep `manager` ownership (user-confirmed).
- `super_receptionist` = receptionist+cashier+inventory composite; `super_admin` normalizes to `admin`.
- Employee self-service payroll = `/api/my-payroll*` for all authenticated staff users.

## 5. Component inventory (verified locations)

| Doc name | Actual location | Status |
|---|---|---|
| ManagerStaff | `frontend/src/components/manager/ManagerStaff.jsx` → `/manager/staff` | active |
| ManagerAttendance | `frontend/src/components/manager/ManagerAttendance.jsx` → `/manager/attendance` | active |
| ManagerLeave | `frontend/src/components/manager/ManagerLeave.jsx` → `/manager/leave` | active |
| ManagerSchedule | legacy URL `/manager/schedule` → redirects to `/manager/attendance` | alias, not a separate page |
| PayrollManagement | `frontend/src/components/manager/PayrollManagement.jsx` → `/manager/payroll` | active |
| PayrollComputation | `frontend/src/components/manager/PayrollComputation.jsx` → `/manager/payroll` (tab); `/manager/payroll/computation` redirects to `/manager/payroll` | active |
| Manual entry | `frontend/src/components/manager/ManualPayrollModal.jsx` | active (client totals now ignored server-side — F-002) |
| Self-service | `frontend/src/components/shared/MyPayroll.jsx` → `/my-payroll` (all staff) | active |

## 6. Initial condition verdict

System builds, runs, and all routes/migrations resolve. Pre-audit suite was green **but** three
executed reproduction tests proved three live defects (double-charged attendance deductions,
client-trusted manual totals, payroll_id collision after soft-delete) — see `PAYROLL_BUG_TRACKER.md`.
Post-fix suite is green including the new regressions.
