# System Authentication & RBAC Audit

**Date:** 2026-11-17 · Consolidates prior evidence + this phase's checks

## Authentication

| Check | Evidence | Result |
| --- | --- | --- |
| Login / logout / register | `EmailAuthFlowTest`, `AuthLoginTest`, e2e `email-auth-flows.spec.js` | PASS |
| Password reset lifecycle | `EmailAuthFlowTest` — token consumed, change notice sent, superseded verify tokens suppressed | PASS |
| Email verification gate | `EnsureEmailIsVerified` blocks unverified customers on booking/checkout POSTs; staff exempt | PASS |
| Inactive account | `ApiTokenAuth.php` rejects deactivated tokens (P1 tests: deactivated→rejected, reactivated→works) | PASS |
| Generic errors (no enumeration) | forgot/reset responses uniform; login errors generic | PASS |
| Token identity consistency | mixed cookie+bearer probe fixed — bearer wins, matches middleware identity (`AuthLoginTest` mixed-credential test) | PASS |
| Rate limiting | login throttle present; named limiters in RouteServiceProvider | PASS |

## RBAC — role × surface matrix

| Resource | customer | receptionist | super_receptionist | cashier | inventory | veterinary | vet_tech | manager | admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Own pets/bookings/payments | RW | – | – | – | – | – | – | – | – |
| Other customers' data | ✗ (IDOR-tested) | staff view | staff view | payments only | – | medical | assist | R | R |
| Request intake/approve/reject | – | RW | RW | – | – | – | – | R | R |
| Payment verification | – | – | RW | RW | – | – | – | – | R |
| POS | – | – | RW | RW | – | – | – | – | R |
| Inventory/stock/batches | – | – | RW | – | RW | – | – | R | R |
| Medical records | own pets R | – | – | – | – | RW | RW | R | R |
| Payroll | own payslip | own payslip | own payslip | own payslip | own payslip | own payslip | own payslip | RW | RW |
| Reports (role-scoped) | own | desk | desk | sales | stock | clinic | clinic | all | all |
| User admin / settings | – | – | – | – | – | – | – | – | RW |

Enforcement is backend-side (`EnsureRole` middleware per route group) — hidden buttons are never the control. Verified by: `phase13-route-authorization-matrix` e2e (722 routes), `PayrollFinalizationTest` 401/403/IDOR probes, `CustomerDataIsolationTest` A/B ownership tests.

## IDOR / mass-assignment

- `CustomerDataIsolationTest`: A↛B pet read/update, email-param can't redirect ownership, staff aliases reject customer/anon.
- Payment proofs + pet photos private-disk, owner-authorized (`StorageLifecycleTest`, `PrivatePetPhotoTest`).
- Boarding `status`/`payment_status` not mass-assignable (`AuditRegressionTest`).
- Payroll `approved_by`/`processed_by`/`status→paid` not client-settable (`PayrollFinalizationTest`).

## Residual

- R-02: exhaustive per-route policy sweep (sampled coverage is strong, not 100% line-by-line).
- R-03: PAT tokens are long-lived; rotation/revocation policy is a production hardening item, not a demo blocker.
