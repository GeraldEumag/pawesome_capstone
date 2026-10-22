# Role and Permission Matrix

**Authority reviewed:** `backend/routes/api.php`, `backend/app/Http/Middleware/EnsureRole.php`, `backend/app/Models/User.php`, `frontend/src/components/ProtectedRoute.jsx`, role route/sidebar modules, and `docs/RBAC_PERMISSION_MATRIX.md`.  
**Runtime status:** CODE-REVIEWED only; no live role sign-in or permission test was performed.

## Effective access summary

| Role | Source-reviewed workspace | Source-reviewed effective access | Notes |
|---|---|---|---|
| Customer | `/customer/*` | Customer portal, own pet/service/payment data subject to backend ownership checks | Customer booking/checkout POST routes that use `verified` require verified email. Admin is explicitly denied customer-only backend routes. |
| Receptionist | `/receptionist/*` | Front desk bookings, customer/pet workflows, walk-ins, receptionist reports/history and supported shared functions | Backend route groups specify receptionist access. |
| Cashier | `/cashier/*` | POS, transactions, payment queue, payment verification/rejection, receipts/reports | Payment actions are state-changing and must be used only for authorized real or isolated test transactions. |
| Inventory | `/inventory/*` | Stock, suppliers, stock history, reports, audits, barcode and inventory maintenance | Stock changes can affect sales and service workflows. |
| Veterinary | `/veterinary/*` | Appointments, consultations, medical records, billing/medical workflows, reports | Medical actions change clinical records and should only be performed by authorized staff. |
| Manager | `/manager/*` | Operational reports, staff/attendance/leave/payroll and related HR functions | Payroll operations are manager/admin; employee self-service is separate. |
| Admin | `/admin/*` plus linked staff workspaces | All staff modules by backend admin bypass, with customer-only routes explicitly blocked | Do not describe admin as a customer portal user. |
| Super Receptionist (`super_receptionist`) | `/super-receptionist/*` plus supported cashier/inventory routes | Receptionist + cashier + inventory | Does not inherit manager, veterinary, admin, or customer access. |
| Payroll | No confirmed dedicated frontend workspace | Not established as a separate valid Payroll Manager role | Create User UI offers `Payroll`, but backend admin user create/update validation excludes it; no payroll role home exists in `ProtectedRoute`. Treat the option as a code/UI discrepancy, not supported access. |

## Permission overview by capability

| Capability | Customer | Receptionist | Cashier | Inventory | Veterinary | Manager | Admin | Super Receptionist |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Submit own service requests | Yes, subject to verification/ownership rules | No customer portal | No customer portal | No customer portal | No customer portal | No customer portal | No customer portal | No customer portal |
| Review/approve receptionist booking queues | No | Yes | No | No | No | No | Staff override | Yes |
| Process cashier POS transactions | No | No | Yes | No | No | No | Staff override | Yes |
| Verify/reject payment requests | No | No | Yes | No | No | No | Staff override | Yes |
| Manage inventory and stock | No | No | No | Yes | No | No | Staff override | Yes |
| Veterinary appointments/medical records | No | No | No | No | Yes | No | Staff override | No |
| Manager operational reporting | No | No | Role-specific cashier reports only | Role-specific inventory reports only | Role-specific veterinary reports only | Yes | Staff/system-wide access | No |
| Manager payroll/HR operations | No | No | No | No | No | Yes | Staff override | No |
| Employee `My Payroll` self-service | Authenticated, caller-scoped endpoint exists, but customer display not confirmed | Route exists | Route exists | Route exists | Route exists | Route exists | Route exists | Route exists |
| Admin user and system management | No | No | No | No | No | No | Yes | No |
| Customer-only portal | Yes | No | No | No | No | No | Explicitly denied | No |

This is a source-derived summary, not a substitute for reviewing each endpoint and controller. Scope-specific exceptions and ownership checks may apply.

## Role normalization and discrepancies

- `EnsureRole` normalizes `vet` and `veterinarian` to `veterinary`, and legacy `super_admin` to `admin`.
- `admin` bypasses staff-role checks but is blocked when the only allowed role is customer.
- `super_receptionist` is expanded to receptionist, cashier, and inventory by backend middleware and `User::hasRoleAccess`.
- `CreateUser.jsx` includes a `Payroll` role option. `ManageUsers.jsx` does not include it in its role options, and `Admin\UserController` create/update validation allows only admin, manager, receptionist, super_receptionist, veterinary, cashier, inventory, and customer. Frontend role home routing does not map `payroll`. Do not include a standalone Payroll Manager chapter without project-owner scope confirmation and resolution of this mismatch.
- `/api/my-payroll` is authenticated but not protected by a role-specific middleware group; inspect controller scoping for self-service. Manager payroll operations are inside manager/admin middleware.
- No runtime role-switch test was performed. All permissions in this matrix are CODE-REVIEWED.
