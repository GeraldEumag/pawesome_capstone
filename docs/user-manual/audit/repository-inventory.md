# Repository and Evidence Inventory

**Review date:** 2026-10-20  
**Review type:** Source and existing-document review only  
**Runtime verification:** Not performed; no local frontend/backend listener was available on ports 3000/8000.  
**Data safety:** No database connection, migration, seeder, test, browser workflow, or production action was performed.

## Project structure and primary sources

| Area | Source reviewed | Purpose in this audit |
|---|---|---|
| Project setup | `README.md`, `AGENTS.md` | Stack, local environment and verification guidance |
| Frontend entry/routes | `frontend/src/App.jsx`, `frontend/src/routes/AppRoutes.jsx` | Public routes and role-module mounts |
| Role routes | `frontend/src/routes/{Customer,Receptionist,Cashier,Inventory,Vet,Manager,Admin,SuperReceptionist}Routes.jsx` | Route-to-component mappings and redirects |
| Navigation/auth UI | `frontend/src/components/ProtectedRoute.jsx`, `frontend/src/context/AuthContext.jsx`, role sidebar components, `frontend/src/components/auth/` | Frontend role navigation, visible menu labels, login/register/recovery screens |
| Frontend API integration | `frontend/src/api/`, selected customer, receptionist, cashier, inventory, veterinary, manager, and admin components | User action to API/service flow |
| API routing and authorization | `backend/routes/api.php`, `backend/app/Http/Middleware/EnsureRole.php`, `backend/app/Http/Middleware/ApiTokenAuth.php` | Endpoint groups and backend access boundary |
| Business logic | `backend/app/Http/Controllers/Api/ServiceRequestController.php`, `ReceptionistRequestController.php`, `Cashier/DashboardController.php`, `Cashier/POSController.php`, `Veterinary/ConsultationWorkflowController.php`, `Inventory/DashboardController.php`, `Customer/CustomerStoreController.php`, `Admin/UserController.php` | Source-level workflow, validation, status, and capability review |
| Role/model rules | `backend/app/Models/User.php`, `backend/app/Http/Controllers/Admin/UserController.php`, `backend/database/migrations/` | Effective role access, allowed role values, and relevant schema history |
| Existing RBAC reference | `docs/RBAC_PERMISSION_MATRIX.md` | Existing role-capability summary; cross-checked with current middleware and routes |
| Existing evaluator guide | `documentation/PAWESOME_SYSTEM_USER_GUIDE_IT_EVALUATORS.md` | Reviewed as evaluator guidance, not accepted as a verified end-user manual |
| Existing project evidence | `docs/EVALUATION_EVIDENCE.md`, `frontend/e2e/`, `documentation/reports/`, `documentation/screenshots/` | Historical leads only; not treated as current runtime proof |

## Architecture and source-of-truth notes

- The system is a Laravel 12 API, React 18/Vite client, and MySQL application.
- Frontend paths and `ProtectedRoute` provide navigation behavior. Backend middleware and controller/policy ownership checks are the authorization source of truth.
- Route and component presence demonstrates a code path, not an end-to-end successful user workflow.
- Existing Playwright specifications and screenshots were not executed or adopted as current-build evidence. `frontend/e2e/phase11-state-changing-workflows.spec.js` can create workflow data and output artifacts, so it was not run.
- No database was inspected. Schema notes in this audit are based on migration/source files, not a live database.

## Scope and evidence findings

1. The primary documented roles are customer, receptionist, cashier, inventory, veterinary, manager, and admin. A `super_receptionist` route and composite middleware behavior are present and should be described as a composite staff role.
2. Payroll management is implemented under manager/admin routes, while `My Payroll` appears in staff routes. The separate `payroll` role is inconsistent: `CreateUser.jsx` displays a Payroll option, but `Admin\UserController` create/update validation excludes `payroll`; frontend role-home routing also has no payroll home. This is a documentation and UI/API scope discrepancy, not evidence of an operational standalone Payroll Manager workspace.
3. `CustomerStoreController::checkout()` immediately returns the disabled-order response with HTTP 410. `CustomerOrderWorkflowsDisabledTest` asserts that customer order writes, payment-proof submission, cancellation, receptionist order handling, and cashier customer-order verification are disabled. The test source was reviewed but not executed in this audit.
4. Customer service bookings are separate from store checkout. The customer route module exposes service and booking pages, and the request controller requires a registered `pet_id` for authenticated bookings. Booking, payment, and staff handoff behavior is source-reviewed only.
5. Public inventory read endpoints exist, but the authenticated customer route module does not expose a completed customer order/checkout route. Public product visibility must not be presented as proof of a working purchase flow.
6. The cashier sidebar labels `/cashier` as **Dashboard**, while `CashierRoutes.jsx` maps the index route `/cashier` to `CashierPOS` and `/cashier/dashboard` to `CashierDashboard`. This is a source-level navigation discrepancy; browser behavior is not confirmed.

## Existing worktree and evidence preservation

At initial status review, the repository had six untracked evaluator-guide files:

- `documentation/PAWESOME_EVALUATOR_GUIDE_ISO_IEC_25010.md`
- `documentation/PAWESOME_EVALUATOR_GUIDE_ISO_IEC_25010.docx`
- `documentation/PAWESOME_EVALUATOR_GUIDE_ISO_IEC_25010.pdf`
- `documentation/PAWESOME_SYSTEM_USER_GUIDE_IT_EVALUATORS.md`
- `documentation/PAWESOME_SYSTEM_USER_GUIDE_IT_EVALUATORS.docx`
- `documentation/PAWESOME_SYSTEM_USER_GUIDE_IT_EVALUATORS.pdf`

These files were left untouched. Existing screenshots in `documentation/screenshots/` and reports in `documentation/reports/` were not copied into this manual because their provenance/build relevance was not established for the current run.

## Environment check

- `docs/user-manual/` did not exist before this documentation work; it was created as a new dedicated directory after the plan was approved.
- No obvious institutional template was found by filename in the reviewed documentation paths. The school should confirm whether a required template exists.
- No listener was available on `127.0.0.1:3000` or `127.0.0.1:8000`. `backend/.env` and `frontend/.env` exist, but their contents were not read.
- `pandoc`, LibreOffice/soffice, and `docx2pdf` are not installed/available in the current command environment. DOCX/PDF export was therefore not attempted.

## Verification boundary

This inventory records source and document review. No feature is marked VERIFIED. Current UI labels and expected outcomes still require browser confirmation before the manual is approved as a final capstone deliverable.
