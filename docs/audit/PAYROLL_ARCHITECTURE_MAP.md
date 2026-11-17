# PAYROLL_ARCHITECTURE_MAP.md

## 1. Data flow

```
Attendance (kiosk/manual) ─┐
Leave requests (approved) ─┤
CompanySchedule (settings) ─┤                              ┌─► PayrollManagement.jsx (list/summary/approve/release/delete)
Users / Employees (salary) ─┼─► PayrollComputationService ─┼─► PayrollComputation.jsx (compute preview → generate)
Manual attendance JSON ────┘   (single source of truth)    └─► ManualPayrollModal.jsx (store/update)
                                     │                                   │
                                     ▼                                   ▼
                          payrolls table (soft-deleted)      Api\PayrollController (manager, role:manager,admin)
                                     │                                   │
                                     ├─► PayrollController@payslip ──► MyPayroll.jsx (employee) + manager payslip
                                     ├─► PayrollController@myPayroll ─► employee list
                                     └─► Admin\ReportsController@managerPayroll ──► PayrollReports.jsx
```

**Authoritative math:** `backend/app/Services/Payroll/PayrollComputationService.php::computeFromAttendance()`
is the ONLY computation engine. `Payroll::calculatePayroll()` delegates to it; `compute`, `generate`,
`store` (post-fix), and `update` all funnel through it. Frontend previews are display-only.

## 2. Traceability table

| Feature | Frontend | API | Controller | Model | Database | Status |
|---|---|---|---|---|---|---|
| Payroll list + summary | `PayrollManagement.jsx` | `GET /api/manager/payroll` | `Api\PayrollController@index` | `Payroll` | `payrolls` | Working |
| Staff payroll list | `PayrollManagement.jsx` (staff context) | `GET /api/manager/staff/{id}/payroll` | `Api\PayrollController@index` | `Payroll` | `payrolls` | Working |
| Compute preview | `PayrollComputation.jsx` | `POST /api/manager/payroll/compute` | `Api\PayrollController@compute` → `PayrollComputationService` | `Payroll`,`Attendance`,`Employee`,`User` | `payrolls`(read), `attendance`, `users`, `employees`, `leave_requests`, `holidays`, `employee_day_offs`, `system_settings` | Working |
| Generate batch | `PayrollComputation.jsx` | `POST /api/manager/payroll/generate` | `Api\PayrollController@generate` | `Payroll` (upsert per person+period) | `payrolls` (unique user/employee+period) | Working; idempotent (updateOrCreate + unique idx) |
| Manual create | `ManualPayrollModal.jsx` | `POST /api/manager/payroll` | `Api\PayrollController@store` | `Payroll` | `payrolls` | **Fixed (F-002)** — person-linked rows recomputed server-side |
| Manual update | `ManualPayrollModal.jsx` | `PUT /api/manager/payroll/{id}` | `Api\PayrollController@update` | `Payroll::calculatePayroll(true)` | `payrolls` | Working; draft/pending only; recompute enforced |
| Approve | `PayrollManagement.jsx` | `POST /api/manager/payroll/{id}/approve` | `Api\PayrollController@approve` | `Payroll` | `payrolls.status → pending` | Working; concurrent-approve safe (evidence: phase12) |
| Release (pay) | `PayrollManagement.jsx` | `POST /api/manager/payroll/{id}/release` | `Api\PayrollController@markAsPaid` | `Payroll`, `SalaryLoan` | `payrolls.status → paid`, `salary_loans`, `email_deliveries` | Working; transactional, outbox payslip email, loan settlement + rollback (tests) |
| Show one | `PayrollManagement.jsx` | `GET /api/manager/payroll/{payroll}` | `Api\PayrollController@show` | `Payroll` | `payrolls` | Working |
| Manager payslip | `PayrollManagement.jsx` | `GET /api/manager/payroll/{payroll}/payslip` | `PayrollController@payslip` | `Payroll` | `payrolls` | Working; **total_deductions aligned (F-001)** |
| Employee payroll list | `MyPayroll.jsx` | `GET /api/my-payroll` | `PayrollController@myPayroll` | `Payroll` | `payrolls` (self-scoped) | Working |
| Employee payslip | `MyPayroll.jsx` | `GET /api/my-payroll/{id}/payslip` | `PayrollController@payslip` (self-scope enforced) | `Payroll` | `payrolls` | Working; IDOR-safe (403 evidence) |
| Payroll report | `PayrollReports.jsx` | `GET /api/manager/reports/payroll` | `Admin\ReportsController@managerPayroll` | `Payroll`,`Attendance` | `payrolls`, `attendance` | Working; **deduction totals aligned (F-001)** |
| 13th month | `PayrollManagement.jsx` (13th tab) | `GET/POST /api/manager/payroll/thirteenth-month*` | `Manager\ThirteenthMonthController` | `ThirteenthMonthAccrual` | `thirteenth_month_accruals` | Working |
| Attendance mgmt | `ManagerAttendance.jsx` | `/api/manager/attendance*` | `Api\AttendanceController` | `Attendance` | `attendance` (unique user+date, employee+date) | Working (dependency) |
| Leave mgmt | `ManagerLeave.jsx` | `/api/manager/leaves*` | leave controller | `LeaveRequest` | `leave_requests` | Working (dependency; only approved paid leave credits) |
| Staff/salary mgmt | `ManagerStaff.jsx` | `/api/manager/staff*` | staff controller | `User`,`Employee` | `users`, `employees` | Working (salary source = `base_salary` on user/employee) |
| Loans | payroll UI fields | `salary_loan`/`cash_advance` on payroll | `Api\PayrollController` + service | `SalaryLoan` | `salary_loans` | Working; installment flooring, settle-on-release, rollback tested |

## 3. Backend class map

- `App\Services\Payroll\PayrollComputationService` — attendance→pay engine (late/undertime/overtime/
  rest-day/holiday/night-diff/leave/proration/loans/employer shares/statutory/tax).
- `App\Support\CompanySchedule` — workdays `[Mon–Sat]`, shift 08:00–17:00, 60-min break, 15-min grace,
  ÷26 daily divisor, 8h OT threshold; sourced from `system_settings`, cached.
- `App\Models\Payroll` — soft deletes; `boot()` generates `PAY-YYYY-NNNN` (**post-fix: max-seq incl. trashed**);
  `calculatePayroll()` delegates to the service; `manual_attendance` JSON merges over kiosk punches.
- `App\Http\Controllers\Api\PayrollController` — manager CRUD/lifecycle.
- `App\Http\Controllers\PayrollController` (non-Api) — `myPayroll` + `payslip` only; no dead duplicate
  endpoints (its manager-facing index/summary methods are unrouted — documented dead-ish code, Low).
- `App\Http\Middleware\EnsureRole` — alias normalization + admin staff access.

## 4. Dead/unused code findings

| Item | Verdict |
|---|---|
| `users.role` enum value `payroll` | Unused by design; documented, not removed (per user decision) |
| Non-Api `PayrollController::index/summary` | Not routed — legacy remnants; harmless, documented (Low) |
| `frontend/src/api/payroll.js` | All exported calls map to live routes — no dead calls found |
| Duplicate components | None found — `PayrollManagement`/`PayrollComputation` are the single pair |

## 5. Schema map (payroll-relevant tables)

`payrolls` (soft deletes, `payroll_id` unique, unique user+period & employee+period) ·
`attendance` (unique `user_id,date` and `employee_id,date`; `employee_id` path for non-account staff) ·
`users`/`employees` (salary: `base_salary`, `hourly_rate`) · `leave_requests` · `holidays` ·
`employee_day_offs` · `salary_loans` · `thirteenth_month_accruals` · `system_settings` · `email_deliveries`.
