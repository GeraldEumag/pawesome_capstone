# Role Permission Security Matrix — 2026-11-08

Status: **Critical matrix tested; not every endpoint/action tested.** Preserve the user-approved existing contract, not the conflicting generic prompt.

| Role | Intended capability boundary | Evidence / remaining checks |
| --- | --- | --- |
| Customer | Own profile/pets/bookings/authorized medical and payment views; no staff actions | CustomerDataIsolationTest, CustomerBookingRulesTest, private-file tests; exhaustive resource/verb isolation remains incomplete. |
| Receptionist | Customer intake, approvals/schedules, grooming/boarding operations; no cashier payment verification | AuthorizationMatrixTest and receptionist/booking suites. |
| Cashier | POS, trusted settlement/proof verification, receipts; no clinical/role management writes | AuthorizationMatrixTest, POS/payment suites, two-process retry race. |
| Inventory | Item/batch/stock/audit operations; no payment or clinical writes | AuthorizationMatrixTest and inventory suites. |
| Veterinary | Clinical workflow and authorized patient records; assigned-workflow mutations and logged cross-vet access as implemented | VeterinaryWorkflowTest explicitly permits certain cross-vet reads with audit logging; do not impose an invented blanket read prohibition. |
| Manager | Reports plus enabled operational HR/payroll/leave/approval/settings capabilities | Manager/HR/payroll suites; not a universal read-only role. |
| Admin | All staff modules; excluded from customer-only routes | EnsureRole, ProtectedRoute and AuthorizationMatrixTest positive/negative controls. |
| Super receptionist | Receptionist + cashier + inventory; no automatic manager/vet/admin expansion | Composite-role matrix regression and browser smoke. |
| Vet tech | Enabled intake/diagnostic collection/results support; no veterinarian-only clinical decisions | VisitIntakeTest, VisitBillingPhaseCTest, VetBatch4SystemTest and browser smoke. |

Legacy `super_admin` normalizes to admin; vet/veterinarian aliases normalize to veterinary. No new role model or permissions redesign was introduced.

The generic prompt's admin restrictions, manager-only-read assumptions and active customer checkout were explicitly rejected as audit contracts. Frontend route restrictions supplement server checks; they never establish ownership security on their own.

Remaining: all API verbs, legacy aliases, downloads/exports, nested IDs, forged privileged fields, deactivation/token lifecycle and every enabled module must be mapped against the complete inventory before a full RBAC sign-off.
