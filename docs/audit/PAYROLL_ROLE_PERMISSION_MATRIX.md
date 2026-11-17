# PAYROLL_ROLE_PERMISSION_MATRIX.md

Verified server-side via `EnsureRole` middleware + executed feature/E2E tests. Hiding UI in React
is not counted as enforcement — all entries below are API-enforced results.

## Matrix

| Capability | customer | receptionist | cashier | inventory | veterinary | super_receptionist | manager | admin |
|---|---|---|---|---|---|---|---|---|
| `GET /api/manager/payroll` (list) | 403 | 403 | 403 | 403 | 403 | 403 | ✅ | ✅ |
| `POST /api/manager/payroll` (manual create) | 403 | 403 | 403 | 403 | 403 | 403 | ✅ | ✅ |
| `POST /api/manager/payroll/compute` | 403 | 403 | 403 | 403 | 403 | 403 | ✅ | ✅ |
| `POST /api/manager/payroll/generate` | 403 | 403 | 403 | 403 | 403 | 403 | ✅ | ✅ |
| `POST …/approve` | 403 | 403 | 403 | 403 | 403 | 403 | ✅ | ✅ |
| `POST …/release` | 403 | 403 | 403 | 403 | 403 | 403 | ✅ | ✅ |
| `GET …/{id}/payslip` (manager) | 403 | 403 | 403 | 403 | 403 | 403 | ✅ | ✅ |
| `GET /api/manager/reports/payroll` | 403 | 403 | 403 | 403 | 403 | 403 | ✅ | ✅ |
| `GET /api/manager/staff/{id}/payroll` | 403 | 403 | 403 | 403 | 403 | 403 | ✅ | ✅ |
| 13th-month endpoints | 403 | 403 | 403 | 403 | 403 | 403 | ✅ | ✅ |
| `GET /api/my-payroll` | own customer recs — none exist for staff roles; staff roles see only own | ✅ own | ✅ own | ✅ own | ✅ own | ✅ own | ✅ own | ✅ own |
| `GET /api/my-payroll/{id}/payslip` | 403 on others' | 403 on others' | 403 on others' | 403 on others' | 403 on others' | 403 on others' | ✅ own | ✅ own |
| Staff salary view/edit (`/api/manager/staff*`) | 403 | 403 | 403 | 403 | 403 | 403 | ✅ | ✅ |
| Attendance mgmt (`/api/manager/attendance*`) | 403 | 403 | 403 | 403 | 403 | 403 | ✅ | ✅ |
| Leave mgmt (`/api/manager/leaves*`) | 403 | 403 | 403 | 403 | 403 | 403 | ✅ | ✅ |

## Evidence

- **Executed negative probes** (phase12 E2E + prior `browser-evidence/manager-payroll*/`): customer
  403; receptionist/cashier/inventory/vet 403 on manager payroll; cashier 403 on generate and
  approve; cashier 403 viewing another employee's payslip; missing resource 404.
- **Executed positive:** manager and admin reach all manager payroll endpoints (phase12 ran the
  full lifecycle as manager on `pawesome_e2e_audit`).
- `EnsureRole` normalizes `super_admin→admin`; `admin` gets all-staff access but is blocked from
  customer portal routes — consistent with AGENTS.md role model.
- Employee self-service payslip is scoped by `user_id = auth()->id()` server-side; `employee_id`
  (non-account) records have no login path by design.
- Unused `payroll` role enum value: **no** endpoint grants it — retained as documented dead value,
  per user decision not to introduce a new role.

## Manager vs admin intent

`manager` is the operational Payroll Manager. `admin` inherits staff access for administrative
oversight — this is the codebase's established policy (admin = all-staff), executed and left
unchanged. Salary visibility is confined to manager/admin + the employee's own self-service.

## UI-layer check

- `/manager/payroll` route is behind `ProtectedRoute` role gating (`ManagerRoutes.jsx`);
  `/my-payroll` available to all staff dashboards. UI gating matches API enforcement (not relied on).
