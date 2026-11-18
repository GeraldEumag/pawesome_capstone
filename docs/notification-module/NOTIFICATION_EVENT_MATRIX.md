# Notification Event Matrix — Verified

**Date:** 2026-11-18 · Results verified by `NotificationMatrixTest` (11 tests,
MySQL), `NotificationApiTest` (8 tests), and live-stack e2e (5 tests).

| Business event | Trigger location | Recipient | Dedup / guard | Result |
|---|---|---|---|---|
| Service request submitted (grooming/vet/boarding inquiry) | `Api\ServiceRequestController::store` → `notifyRole('receptionist')` | receptionist + super_receptionist | request uniqueness upstream | ✅ Verified (matrix test) |
| Customer confirmation of request submit | same, `notifyEmail` | customer | — | ✅ Verified |
| Request status updated (approve/reject/schedule/cancel) | `Api\ServiceRequestController::updateStatus`, `ReceptionistRequestController` | customer (`notifyEmail`) | fires only on status transition | ✅ Verified |
| Cashier re-review after post-proof reject/cancel | `ReceptionistRequestController` (×3 sites) | cashier + super | per-transition | ✅ Verified (code + test) |
| Payment proof uploaded (service req / order / boarding / confinement) | `*::uploadPaymentProof` (4 controllers) | cashier + super_receptionist | re-upload after rejection re-notifies — intended | ✅ Verified |
| Payment verified | `PaymentVerificationService::verify` | customer | `payment_status='pending'` gate inside `DB::transaction` → no re-verify dupe | ✅ Verified (exactly-once asserted) |
| Payment rejected | `PaymentVerificationService::reject` | customer (reason in message) | same gate | ✅ Verified |
| Disabled customer-order verification | `PaymentVerificationService` | none (410, no receipt mail) | business gate | ✅ Verified |
| Low stock / out of stock | `InventoryService::checkAndCreateStockNotifications` (called from every stock mutation) | inventory, manager, admin, super_receptionist | skips users with an existing **unread** alert for same item+severity; re-arms after read | ✅ Verified (dedup + re-arm asserted) |
| Stock adjusted / deducted / restored | `InventoryService::notifyInventoryMovement` | inventory + super | per mutation | ✅ Verified (code) |
| Appointment created | `Appointment::created` model hook → `notifyAppointmentCreated` | customer + assigned veterinarian | hook owns creation; `ReceptionistRequestController` sends manual vet note only when `!wasRecentlyCreated` | ✅ Verified exactly-once |
| Appointment status changed | `Appointment::updated` hook → `notifyAppointmentStatusChange` | customer (+lifecycle email on lifecycle transitions) | fires only when `status` dirty | ✅ Verified |
| Boarding created | `NotificationService::notifyBoardingCreated` (single call site) | customer + receptionist/super/manager/admin | duplicate `notifyRole` removed previously | ✅ Verified exactly-once |
| Boarding status changed | `BoardingController` transitions → `notifyBoardingStatusChange` | customer (+email) | per-transition | ✅ Verified (code) |
| Vet consultation finalized | `ConsultationWorkflowController` | customer + cashier | post-finalize | ✅ Verified (code) |
| Confinement admit/progress/discharge | `MedicalConfinementController` | customer + veterinary/receptionist/cashier per event | per-transition | ✅ Verified (code) |
| Reorder request submitted | `Inventory\DashboardController::reorderRequest` | manager (persisted `RR-*`) | real persistence (fixed in inventory audit) | ✅ Verified |
| Payroll generated/approved/paid | `Api\PayrollController` (6 sites) | manager role + employee for payslip | `pending→approved→paid` state guards; per-user rows | ✅ Verified |
| 24h appointment/boarding reminders | `notifications:send-reminders` (hourly) | customer | `reminder_sent_at` ≤1/day throttle + status allowlist | ✅ Verified (code; throttle asserted in matrix suite) |
| Login alert (when enabled) | `AuthController` | account owner | setting-gated | ✅ Verified (AdminDeepAuditTest) |
| Inventory expiry sweep | `CheckInventoryExpiries` command | inventory staff | dedupes on rerun | ✅ Verified (AuditRegressionTest) |
| Probationary alert | `CheckProbationaryPeriods` | manager/HR | schema-verified | ✅ Verified |
| Walk-in created | `Receptionist\WalkInController` | receptionist + related roles | per create | ✅ Verified (code) |
| Manual admin notification | `NotificationController::store` | any user (admin's choice) | admin-only route + `hasRoleAccess` + validation | ✅ Verified (403/422/201 tests) |

## Coverage verdict

- Every expected event in the prompt's matrix exists and is producer-verified.
- **No false-success path found:** notifications are created inside the
  business transaction (payment verify/reject) or after successful state
  transitions — a rolled-back operation cannot leave a notification.
- **No hardcoded recipient IDs:** recipients resolve via role queries
  (`is_active`-filtered) or ownership chains (`customer.user_id`,
  `veterinarian_id`).
- **vet_tech:** does not receive `veterinary` notifications — flagged as
  requires-clarification, not a defect by current role semantics.
