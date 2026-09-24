# Pawesome RBAC Permission Matrix

Canonical role/capability map, extracted from `backend/routes/api.php`
middleware groups, `App\Http\Middleware\EnsureRole`, controller authorization
checks, and `frontend/src/components/ProtectedRoute.jsx`.

**Enforcement rule:** backend middleware + controller ownership checks are
authoritative. The React `ProtectedRoute` guard is navigation UX only and is
never a security boundary.

## Base capability matrix

| Capability | Customer | Receptionist | Cashier | Inventory | Veterinary | Manager | Admin |
|---|---|---|---|---|---|---|---|
| Create service request | ✓ | — | — | — | — | — | — |
| Approve/reject request | — | ✓ | — | — | — | — | — |
| Verify/reject payment | — | — | ✓ | — | — | — | — |
| POS checkout / void | — | — | ✓ | — | — | — | — |
| Manage inventory | — | — | — | ✓ | — | — | — |
| Manage veterinary records | — | — | — | — | ✓ | — | — |
| Attendance punch | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| View operational reports | — | — | — | — | — | ✓ | ✓ |
| User/role management | — | — | — | — | — | — | ✓ |
| Activity-log viewing | — | — | — | — | — | ✓ | ✓ |
| Vet appointment hard delete | — | — | — | — | — | — | ✓ |

## Composite roles (EnsureRole semantics)

| Role | Effective access |
|---|---|
| `super_admin` | All staff modules. Explicitly blocked from customer-only routes. |
| `super_receptionist` | receptionist + cashier + inventory. No manager/vet/admin/customer access. |

- `vet` / `veterinarian` normalize to `veterinary`.
- Every request re-reads the role from the database-backed user record, so role
  changes take effect on the next request (no cached grants).

## Intentional shared/public surface

| Endpoint class | Access | Notes |
|---|---|---|
| `POST /api/attendance/*` | all staff roles | Employees punch their own attendance; customers blocked. |
| `GET /api/inventory/sellable` | public | Storefront catalog — payload minimized (no `supplier`, `reorder_level`). |
| `GET /api/my-payroll*` | any authenticated user | Employee self-service; controller scopes to the caller. |
| Chatbot | authenticated | Customer intents scoped to own data; staff intents stay behind their role's data. |
| `GET /api/files/care-logs/{id}/view` | owner + receptionist/vet/manager/admin | Cashier and inventory denied. |

## Findings from the audit and resolutions

| # | Finding | Resolution |
|---|---|---|
| 1 | `POST /api/attendance/check-in|check-out` sat in a bare `auth.api` group — customers could punch attendance. | Moved to a staff-only role group. |
| 2 | `DELETE /api/vet/{id}` (hard delete) was inside the receptionist `vet` group; no UI calls it. | Moved to an admin-only route. |
| 3 | Public `GET /api/inventory/sellable` leaked `supplier` and `reorder_level`. | Payload trimmed to customer-facing fields. |
| 4 | Activity-log GETs were admin-only; manager was meant to have read access. | Moved to `role:admin,manager`. |

## Regression coverage

`backend/tests/Feature/AuthorizationMatrixTest.php` asserts for each critical
operation that every unauthorized role receives `403` **and** produces no
state change, plus positive controls and composite-role semantics.
