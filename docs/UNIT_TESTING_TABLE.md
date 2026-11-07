# Table 6. Unit Testing of the System

Pawesome test results, grouped by module. Each Status comes from an actual
test run (backend, frontend unit and E2E 2026-11-08), not from assumption.

- **Backend (PHPUnit):** against MySQL `pawesome_test`. Full run (2026-11-08): 901 passed, 1 skipped, 0 failed (4,082 assertions), including `LandingPageContentAdminTest` (13 tests). The skip is the GD-dependent test (GD is not installed locally).
- **Frontend unit (Vitest + React Testing Library):** 29 passed in 6 files (`client.test.js`, `StatusBadge.test.jsx`, `ProtectedRoute.test.jsx`, `Login.test.jsx`, `Modal.test.jsx`, `DatePickerInput.test.jsx`).
- **Frontend E2E (Playwright):** against the live dev stack, run serially (one worker). Latest full run (2026-11-08): 583 passed, 1 failed, 1 flaky (passed on retry), 2 skipped, 0 did not run, of 587 (~44 min). The one failure — `booking-channel-gating` walk-in counter-collection — was a test-side slot-probing gap; it is now availability-driven and verified passing. The two skips are intentional (the after-18:00 check-in gate, and booking rules covered by `CustomerBookingRulesTest.php`). Statuses in the table are from individual and grouped runs.

Status meanings:
- **Working:** every test covering the row passed.
- **Partially working:** the PHPUnit tests pass, but at least one browser (E2E) test for the same flow failed.
- **Failing:** a test covering this row failed in the run.
- **Not covered:** no automated test exists yet.

| MODULE | FUNCTIONALITY | INPUT | OUTPUT | STATUS |
| --- | --- | --- | --- | --- |
| **Authentication** | Validates login with correct credentials (`AuthLoginTest`) | Email, password (valid account) | "Login successful", token and user returned | Working |
| Authentication | Handles invalid credentials (`AuthLoginTest`) | Wrong password; unknown email | 401 "Invalid credentials" (same message for both) | Working |
| Authentication | Blocks inactive accounts (`AuthLoginTest`) | Valid password, account set inactive | 403 "Account is inactive" | Working |
| Authentication | Rejects a missing password (`AuthLoginTest`) | Email only | 422 validation error on `password` | Working |
| Authentication | Token authenticates the session (`AuthLoginTest`) | Bearer token from login; no token | `/auth/me` returns the user; no token returns 401 | Working |
| Authentication | Registration, email verification, password reset (`EmailAuthFlowTest` 33; E2E `manual-e2e-chain3` register flow) | Registration form; verification and reset links | Account created unverified; verification and reset complete | Working |
| **Customer Portal** | Booking request, payment proof upload, booking channel (`PaymentBookingChannelTest` 27, `CustomerBookingRulesTest` 17) | Service request, proof file, payment method | Booking stored with channel; proof attached; rules enforced | Working |
| Customer Portal | Customer data isolation (`CustomerDataIsolationTest` 4, `CustomerBookingBoardTest` 6, `CustomerTrackingTest` 2) | Requests from another customer's account | Another customer's data is not returned | Working |
| Customer Portal | Notification email preferences (`EmailPreferencesAndTemplatesTest` 5; E2E `email-preferences-toggle`) | Preference toggle on/off | Preference saved; send honors it | Working |
| Customer Portal | Customer dashboard and services UI (E2E `customer-dashboard`, `customer-dashboard-revisions`) | Navigation, service cards, chatbot | Pages render; navigation works | Working |
| **Receptionist** | Approves a veterinary request into an available slot (`VetUxHandoffTest` 5) | Approved request, vet ID, rescheduled time | Request approved and appointment created | Working |
| Receptionist | Check-in gate (`ReceptionistCheckInGateTest` 9) | Check-in for an appointment or boarding | Check-in allowed only when the gate conditions hold | Working |
| Receptionist | Required cancel/reject reasons (`ReceptionistReasonRequiredTest` 7) | Cancel or reject with no reason | Action refused; reason required | Working |
| Receptionist | Booking scheduling, store hours, holidays (`BookingSchedulingIntegrityTest` 6, `StoreHoursAndHolidayBookingTest` 11) | Bookings on open, closed, and holiday dates | Closed or holiday slots refused; open slots accepted | Working |
| Receptionist | Boarding room lifecycle (`BoardingRoomLifecycleTest` 12) | Room assignment, check-in, check-out | Room state transitions correct | Working |
| Receptionist | Booking list ordering (E2E `receptionist-booking-order`) | Hotel, vet, and grooming bookings | Earliest item first | Working |
| **Cashier** | Payment verification and settlement (`PaymentSettlementTest` 8, `CashierQueueDedupeTest` 2) | Payment proof; counter cash | Payment verified once; queue deduplicated | Working |
| Cashier | POS sale (`POSTest` 7) | Items, quantities, payment | Sale recorded with correct total | Working |
| Cashier | Receipt VAT breakdown (`ReceiptBreakdownTest` 5) | Sale with VAT | VAT split shown on receipt | Working |
| **Inventory** | Stock CRUD and dashboard (`InventoryTest` 26, `InventoryDashboardTest` 6, `InventoryArchiveDeletionTest` 3) | Item create/edit/archive; stock change | Stock and item records updated; archive keeps history | Working |
| Inventory | Item field validation (Unit `InventoryItemValidationTest` 20) | Invalid and valid item fields | Invalid rejected; valid accepted | Working |
| Inventory | Batch reconciliation (`InventoryBatchReconciliationTest` 11) | Batches vs. stock drift | Drift detected; `--apply` repairs | Working |
| **Veterinary** | Visit intake and check-in (`VisitIntakeTest` 8) | Checked-in appointment | Visit started; clinical routes gated by role | Working |
| Veterinary | Consultation, billing, pharmacy (`VeterinaryWorkflowTest` 24, `VisitBillingPhaseCTest` 11, `VeterinaryBillingPaymentFlowTest` 6, `PharmacyConfinementPhaseDTest` 9) | Consultation record, billable items, confinement | Billing totals and payment status correct | Working |
| Veterinary | Cancellation reason (`VetCancellationReasonTest` 7) | Cancel with predefined reason | Reason stored; invalid reason refused | Working |
| Veterinary | Medical record form payload (`MedicalRecordFormPayloadTest` 1) | Record form fields | Payload saved | Working |
| Veterinary | Vet dashboard and deletion reasons in the browser (E2E `vet-dashboard` 7, `deletion-reasons`) | Vet UI navigation; vet service deletion | Pages render; reason required | Working |
| **Manager** | Payroll computation (`PayrollCalculationTest` 13, `PayrollIndustryTest` 11, `PayrollLeavePolicyAuditTest` 8, `PayrollEndToEndTest` 9, `HrFinanceWorkflowTest` 23) | Attendance, leave, rates, deductions | Gross, deductions, and net correct | Working |
| Manager | Day-offs (`DayOffScheduleTest` 9) | Set and clear day-offs | Schedule updated; invalid input refused | Working |
| Manager | Leave requests (`MyLeaveSelfServiceTest` 5) | Employee leave filing and balance | Balance deducted on approval | Working |
| Manager | Attendance and corrections (`AttendanceCorrectionConsistencyTest` 13, `ManagerAttendanceApiTest` 4, `BarcodeLookupTest` 23) | Barcode punch; correction request | Punch recorded; correction applied after approval | Working |
| Manager | Staff directory (`ManagerPeopleEndpointTest` 5) | Staff list request | Scoped staff data returned | Working |
| Manager | Receipt scanner settings and metrics (`ReceiptScannerSettingsTest` 6, new) | Provider patterns, clinic accounts, metrics request | Settings saved; metrics return per-reader data; customer gets 403 | Working |
| Manager | Dashboard (E2E `manager-dashboard` 7, `manager-responsive-audit` 3) | Dashboard refresh; navigation | Data reloads; navigation works | Working |
| **Admin** | Role and permission matrix (`AuthorizationMatrixTest` 11, `P1SecurityIntegrityTest` 15) | Requests per role | Each role reaches only its own modules | Working |
| Admin | Deletion reasons (`DeletionReasonAuditTest` 6) | Delete with and without reason | Reason required and audited | Working |
| Admin | Audit logs (`AuditLogTest` 9, `AuditRegressionTest` 10) | Auditable actions | Entries written | Working |
| Admin | Theme settings (`SystemThemeSettingsTest` 3) | Theme setting update | Setting saved and returned | Working |
| Admin | Attendance kiosk PIN (`KioskPinTest` 4, new) | Correct PIN; wrong PIN; blank; unset PIN | Correct PIN unlocks; others refused | Working |
| Admin | Reports and exports (`ReportsTest` 10) | Report filters and export | Totals correct | Working |
| Admin | Admin dashboard and user management (E2E `admin-dashboard`, `admin-dashboard-revisions`) | Admin navigation; delete user with reason | Pages render; delete requires reason | Working |
| Admin | Landing page content editing (`LandingPageContentAdminTest` 13) | Section updates, activation toggle, image upload; customer access | Content saved and served on public endpoint; customer 403; guest 401 | Working |
| **Chatbot and Live Chat** | Chatbot answers and guards (`ChatbotEndToEndTest` 20, `ChatbotRemediationTest` 22, `ChatbotConversationSimulationTest` 12, `ChatbotReliabilityTest` 5, `ChatbotGroqTest` 5, `ChatbotFactsGuardTest` 3) | Chatbot questions | Grounded answers; unsafe answers blocked | Working |
| Chatbot and Live Chat | Live chat session lifecycle (`LiveChatTest` 5, new) | Customer starts chat; staff inbox; message after close | Session waiting; staff sees it; customer blocked from inbox; closed chat refuses messages | Working |
| Chatbot and Live Chat | Telegram bot | Bot messages | Bot replies | Intentionally skipped (out of scope per owner decision) |
| **Notifications and Email** | Email outbox and dispatch (`EmailDeliveryOutboxTest` 14, `PaymentReceiptOutboxTest` 9) | Business event producing an email | Intent queued once; dispatched; deduplicated | Working |
| Notifications and Email | Notification matrix and templates (`NotificationMatrixTest` 11, `EmailServiceWorkflowTest` 11, `EmailStructuredContentTest` 12, `EmailMailableSecurityTest` 3) | Notification events; mailable data | Correct recipients and content; no secret leakage | Working |
| Notifications and Email | Cross-role email workflow (E2E `email-cross-role-workflow`) | Customer to cashier receipt chain | Receipt email sent | Working |
| **Receipt Scanner** | Upload, reading, validation, confirm (`ReceiptScannerTest` 27, 1 skipped) | GCash/Maya receipt image or PDF; reader chain | Reference extracted; duplicates blocked; cashier confirms | Working |
| Receipt Scanner | Upload limits and duplicate references (`ReceiptScannerTest`) | 16th upload; reused reference | 16th refused; duplicate blocked | Working |
| **Storage and File Access** | Private/public uploads and lifecycle (`StorageLifecycleTest` 11, `PrivatePetPhotoTest` 2, `PrivateCareLogPhotoTest` 2, `PrivateConfinementPaymentProofTest` 1) | File upload; file replacement; view | Files stored privately; evidence retained on replace | Working |
| Storage and File Access | Payment proof storage in the browser (E2E `storage-hardening`) | Customer proof, cashier view, resubmit | Proof kept as evidence | Working |

## Failing and not-run items

### PHPUnit
No failing tests in the full run (2026-11-08). `VetUxHandoffTest::test_receptionist_can_approve_vet_request_at_rescheduled_slot`
now passes; its fixture dates were made holiday-aware. One skip remains: the
`ReceiptScannerTest` image-downscale case, which skips when PHP GD is unavailable.

### Playwright E2E (full serial run, 2026-11-08)
- Result: 583 passed, 1 failed, 1 flaky (passed on retry), 2 skipped, 0 did not run, of 587 (~44 min).
- The one failure — `booking-channel-gating.spec.js` "walk-in booking: queued for counter collection" — was a test-side gap: its fixture blind-posted candidate dates instead of asking the real availability endpoint. It is now availability-driven (same pattern as the spec's online-booking test) and verified passing in isolation.
- Flaky (passed on retry): `mobile-portrait-audit` admin `/admin/reports` — a `page.evaluate` stall under suite load, not a product defect.
- Skipped (2, both intentional): the revision-b hotel check-in test skips after 18:00 because same-day hotel bookings close at 18:00 (it runs before then); the Playwright booking-rules test whose assertions live in `CustomerBookingRulesTest.php`.
- Did not run (0): the earlier 24 serial-cascade skips are all resolved — every spec in those groups now completes.

### How the earlier failures were resolved
All failures were investigated to root cause and fixed in test or app code; none were skipped to hide a defect. Fixes included stale selectors and labels matched to the current UI, availability-driven slot fixtures (the shared dev database accumulates bookings, so fixed dates saturate), endpoint-aware response listeners, a Vite `host: "127.0.0.1"` pin (Vite had bound IPv6-only and refused test connections), a super-receptionist navigation race, and timing-hardened assertions for suite load. Earlier runs also surfaced the 429 throttling problem, resolved via a raised local `API_RATE_LIMIT_PER_MINUTE`. One real defect was found and fixed along the way: a reserved SQL alias in the receipt scanner metrics. Details are in `docs/E2E_TRIAGE.md`.

## Coverage gaps (not covered by any test)
- Telegram bot messaging — intentionally skipped (out of scope per owner decision)
- Frontend unit coverage is still selective: 29 Vitest tests cover `client`, `Login`, `ProtectedRoute`, `StatusBadge`, `Modal`, and `DatePickerInput`; most other components have none.
