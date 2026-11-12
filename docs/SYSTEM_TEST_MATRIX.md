# System Test Matrix

Status key: **Working** = covered by passing tests from the latest run. **Failing** = covered, with a failing test (see `docs/E2E_TRIAGE.md`). **Not covered** = no test yet. **Deferred** = assigned to a later batch.

Last updated: 2026-11-08. All seven role batches (1-7) are covered. Latest full serial Playwright run (2026-11-08): 583 passed, 1 failed, 1 flaky (passed on retry), 2 skipped, 0 did not run (of 587, ~44 min). The single failure — `booking-channel-gating.spec.js` walk-in counter-collection — was a test-side slot-probing gap and is fixed and verified: the spec now finds a genuinely free slot through the real `/availability/grooming` endpoint before posting (same pattern as the spec's online-booking test). Both skips are intentional: the after-18:00 same-day check-in gate (documented time restriction) and the customer booking rules test whose assertions live in `CustomerBookingRulesTest.php`. Backend: 923 passed, 1 skipped (`ReceiptScannerTest` image-downscale case — skips when PHP GD is unavailable; documented environment limitation), 0 failed, 4603 assertions. The kiosk→payroll chain is proven end-to-end by `PayrollYear2026Test` (6 tests): PIN-gated barcode punches land on `attendance` rows and are counted by payroll compute/generate across all 24 semi-monthly periods of 2026. That work also surfaced and fixed a defect where `Attendance::calculateHours()` read `break_time` through the `datetime` cast and wrote `total_hours = 0` on every check-out re-save. Every failure observed across the sweeps was investigated to root cause and fixed in test or app code; remaining variance is suite-load timing, not product defects.

## Batch 1: Public, Auth, Customer

### Public pages

| Area | Role | Route or endpoint | Component | Expected access | Existing test | New test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Public | anonymous | `/` | `LandingPage` | allowed | batch1-customer-system (renders, no uncaught errors) | `batch1-customer-system.spec.js` | Working |
| Public | anonymous | `/login` | `Login` | allowed | batch1 (renders; phone width) | `batch1-customer-system.spec.js` | Working |
| Public | anonymous | `/register` | `Register` | allowed | batch1 (renders) | `batch1-customer-system.spec.js` | Working |
| Public | anonymous | `/forgot-password` | `ForgotPassword` | allowed | batch1 (renders) | `batch1-customer-system.spec.js` | Working |
| Public | anonymous | `/verify-email` | `VerifyEmail` | allowed | none | none | Not covered |
| Public | anonymous | `GET /api/health`, `/api/settings/public`, `/api/landing-page` | n/a | allowed | `CustomerBatch1SystemTest` | `CustomerBatch1SystemTest.php` | Working |
| Public | anonymous | `/attendance-kiosk` (PIN gate) | `KioskGate` | allowed | `KioskPinTest` | `KioskPinTest.php` | Working (backend) |
| Public | anonymous | `POST /api/kiosk/punch` → payroll feed | `BarcodeAttendanceController` → `attendance` | PIN or staff token | `PayrollYear2026Test` | `PayrollYear2026Test.php` | Working (backend) |
| Public | anonymous | Landing mobile drawer | `LandingPage` | allowed | `public-pages-responsive-audit` | none | Working |
| Public | anonymous | Landing chatbot | `LandingChatbot` | allowed | none in batch 1 | none | Not covered |

### Auth

| Area | Role | Route or endpoint | Component | Expected access | Existing test | New test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auth | anonymous | `POST /api/auth/register` | `Register` | creates unverified customer | `CustomerBatch1SystemTest` (201, token); `EmailAuthFlowTest` | `CustomerBatch1SystemTest.php` | Working |
| Auth | anonymous | register duplicate email | `Register` | 422 email error | `CustomerBatch1SystemTest` | `CustomerBatch1SystemTest.php` | Working |
| Auth | anonymous | `POST /api/auth/login` (email and username) | `Login` | token and user | `CustomerBatch1SystemTest`; `AuthLoginTest` | yes | Working |
| Auth | anonymous | login form validation, submit payload, error display | `Login` | required fields; `login` key; server error shown | `Login.test.jsx` (4 tests) | yes | Working |
| Auth | any | `GET /api/auth/me` requires token | `AuthController` | 401 without token | `CustomerBatch1SystemTest`; `AuthLoginTest` | yes | Working |
| Auth | anonymous | `POST /api/auth/password/forgot` (unknown email) | `ForgotPassword` | generic message | `CustomerBatch1SystemTest` | yes | Working |
| Auth | anonymous | `POST /api/auth/email/resend` (unknown email) | `VerifyEmail` | generic 200 | `CustomerBatch1SystemTest` | yes | Working |
| Auth | anonymous | `POST /api/auth/password/reset` (bad token) | `ForgotPassword` | generic error | `EmailAuthFlowTest` | none new | Working (existing) |
| Auth | customer | `PUT /api/auth/profile` | `ProfileSettings` | name updated | `CustomerBatch1SystemTest` | yes | Working |
| Auth | customer | profile photo, password change | `ProfileSettings` | upload and change | `StorageLifecycleTest`, `PrivatePetPhotoTest` (photo); none for password change | none | Partially covered |
| Auth | any | logout | `Logout` | token cleared | none | none | Not covered |
| Auth | any | session expiry redirect | `client.js` 401 handler | redirect to login | none | none | Not covered |

### Customer role

| Area | Role | Route or endpoint | Component | Expected access | Existing test | New test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Customer | customer | 12 routes: services, bookings, pets, hotel, grooming, vet, medical-confinements, profile, history, notifications, payments, reports/payments | `CustomerRoutes` | allowed, no uncaught errors | `batch1-customer-system.spec.js` (12 tests) | yes | Working |
| Customer | customer | `/customer/services` heading, "New Request" tab | `CustomerServices` | documented tabs | `customer-dashboard` | none | Working |
| Customer | customer | service card single-click navigates | `CustomerServices` | card click | `customer-dashboard-revisions` | none | Working |
| Customer | customer | bookings board filters | `CustomerRequestStatus` | filters keep state | `customer-bookings-board` | none | Working |
| Customer | customer | bookings tabs keep state after refresh | `BookingTracker` | refresh control | `booking-tracker-tabs` | none | Working |
| Customer | customer | notification preference toggle persists | `CustomerNotifications` / profile | PUT then GET | `email-preferences-toggle` | none | Working |
| Customer | customer | Hotel, grooming, vet forms | `HotelForm`, `GroomingForm`, `VetForm` | required fields; payload | `adviser-revisions` (partial) | none yet | Partially covered |
| Customer | customer | pet add modal | `CustomerPets` | create pet | `customer-add-pet-modal` (6 pass) | none | Working (E2E) |
| Customer | customer | `/customer/bookings` load | `CustomerRequestStatus` | loads | `customer-my-requests-link` | none | Working |
| Customer | customer | owner views own vaccination card; other customers get 403 | `SecureFileController::viewVaccinationCard` | owner 200, other 403 | `VaccinationCardOwnerAccessTest` (2) | yes | Working (fixed: owner check compared `customers.id` to `users.id`) |
| Customer | customer | `GET /api/customer/overview` role gate | `PortalController` | 401 no token, 403 admin, 200 customer | `CustomerBatch1SystemTest` | yes | Working |
| Customer | customer | unverified customer blocked from `POST /customer/requests` | `ServiceRequestController` | 403 `email_unverified` | `CustomerBatch1SystemTest` | yes | Working |
| Customer | customer | own pets only | `PetController` | other customers' pets hidden | `CustomerBatch1SystemTest` | yes | Working |
| Customer | customer | receipt ownership | `ServiceRequestController::receipt` | intruder 404; owner 422 until paid | `CustomerBatch1SystemTest` | yes | Working |
| Customer | customer | notification preferences GET and PUT | `PortalController` | round trip | `CustomerBatch1SystemTest`; `EmailPreferencesAndTemplatesTest` | yes | Working |
| Customer | customer | non-customer roles redirected away from customer portal | `ProtectedRoute` | redirect to `/customer` | `batch1-customer-system.spec.js` (5 routes); `ProtectedRoute.test.jsx` | yes | Working |
| Customer | customer | unverified customer redirect to `/verify-email` | `Login` | redirect | none | none | Not covered |
| Customer | customer | booking POST endpoints (hotel, grooming, vet, boarding) validation | `ServiceRequestController`, `BoardingController` | 422 on bad input | `CustomerBookingRulesTest` (17 existing) | none new | Working (existing) |
| Customer | customer | payment proof upload and receipt polling | `ServiceRequestController`, `CustomerReceiptController` | proof attached; status | `ReceiptScannerTest`, `PaymentBookingChannelTest` | none new | Working (existing) |
| Customer | customer | ProtectedRoute role map | `ProtectedRoute` | redirects by role | `ProtectedRoute.test.jsx` (4 tests) | yes | Working |
| Shared | any | `normalizeList` | `api/client.js` | list normalization | `client.test.js` (4 tests) | yes | Working |
| Shared | any | `StatusBadge` | `shared/StatusBadge.jsx` | variant classes | `StatusBadge.test.jsx` (2 tests) | yes | Working |
| Shared | any | `DatePickerInput` | `shared/DatePickerInput.jsx` | placeholder, disabled, required, value display | `DatePickerInput.test.jsx` (7 tests) | yes | Working |
| Shared | any | `Modal` | `shared/Modal.jsx` | portal render, Escape/backdrop close, scroll lock | `Modal.test.jsx` (8 tests) | yes | Working |
| Shared | any | avatar util | `utils/avatar.js` | behavior | none | none | Not covered |

## Batch 2: Receptionist and Super Receptionist

| Area | Role | Check | Coverage | Result | Evidence | Auto? | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Receptionist | receptionist | every `/receptionist/*` route renders | `batch2-receptionist-system.spec.js` | all routes render; `/receptionist/medical-confinements` redirects to hotel queue | yes | Working |
| Receptionist | super_receptionist | every `/super-receptionist/*` route renders | `batch2-receptionist-system.spec.js` | all routes render | yes | Working |
| Receptionist | other staff | customer/manager/admin/cashier/vet blocked | `batch2-receptionist-system.spec.js` | redirect | yes | Working |
| Receptionist | receptionist | pending queue role gate + visibility | `ReceptionistBatch2SystemTest` | 401 guest, 403 customer, 200 receptionist | yes | Working |
| Receptionist | receptionist | grooming approval is idempotent | `ReceptionistBatch2SystemTest` | second approve returns 200 "already approved", no duplicate record | yes | Working |
| Receptionist | receptionist | walk-in validation and staff access | `ReceptionistBatch2SystemTest` | validation enforced | yes | Working |
| Receptionist | super_receptionist | queue access | `ReceptionistBatch2SystemTest` | 200 | yes | Working |
| Receptionist | receptionist | vet approve holiday/slot validation | `VetUxHandoffTest` | 5 tests pass (holiday-aware fixture dates) | yes | Working |
| Receptionist | receptionist | boarding room list hides soft-deleted rooms | `BoardingRoomAvailabilityTest` | deleted room excluded | yes | Working |
| Receptionist | receptionist | walk-in modal opens at both widths | `adviser-revisions.spec.js` | "New Booking" opens `.hbk-modal` | yes | Working |
| Receptionist | receptionist | booking lists earliest-first ordering | `receptionist-booking-order.spec.js` | 3 service types sorted | yes | Working |
| Receptionist | receptionist | hotel check-in posts boarding id and rejects duplicate | `revision-b-verification.spec.js` | own paid fixture, in_care, duplicate 422 | yes | Working |
| Receptionist | veterinary | cancel reason dropdown workflow | `revision-b-verification.spec.js`; `receptionist-revisions.spec.js` | predefined reasons, Other requires explanation | yes | Working |
| Receptionist | receptionist | booking tracker keeps cancelled requests | `revision-b-verification.spec.js` | cancelled card visible (To Pay group) | yes | Working |
| Receptionist | customer | receipt VAT breakdown | `revision-b-verification.spec.js` | vat = total*12/112 | yes | Working |
| Receptionist | receptionist | payment modal e-wallets only; cash rejected | `revision-b-verification.spec.js` | gcash/maya; cash 422 | yes | Working |
| Receptionist | receptionist | room assignment by boarding-room ID; legacy hotel IDs not offered | `receptionist-room-assignment.spec.js` | `boarding:{id}` posts room_id; `hotel:` options retired | yes | Working |
| Receptionist | receptionist | row-action popover across roles | `row-action-popover.spec.js` | 6 tests | yes | Working |
| Receptionist | receptionist | revisions (cancel reasons, service disable/delete, walk-in, customer delete) | `receptionist-revisions.spec.js` | 6 tests | yes | Working |
| Receptionist | receptionist | dashboard refresh and navigation | `receptionist-dashboard.spec.js` | passes | yes | Working |
| Super Receptionist | super_receptionist | responsive audit incl. POS/admin isolation | `super-receptionist-responsive-audit.spec.js` | passes (1 flake under load, passes isolated) | yes | Working |

## Batch 3: Cashier

| Area | Role | Check | Coverage | Result | Evidence | Auto? | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Cashier | cashier | all 11 `/cashier/*` routes render | `batch3-cashier-system.spec.js` | render, no uncaught errors | yes | Working |
| Cashier | cashier | blocked from customer/admin/manager/receptionist/vet/inventory | `batch3-cashier-system.spec.js` | redirect to `/cashier` | yes | Working |
| Cashier | super_receptionist, admin | `/cashier/pos` access per `routeRoleMap` | `batch3-cashier-system.spec.js` | renders | yes | Working |
| Cashier | cashier | dashboard/payment queue/transactions/history/reports | `CashierBatch3SystemTest` | 401 guest, 403 other roles, 200 cashier | yes | Working |
| Cashier | cashier | verify uploaded proof sets `payment_status=paid` | `CashierBatch3SystemTest` | passes | yes | Working |
| Cashier | cashier | reject requires a reason, sets `rejected` | `CashierBatch3SystemTest` | 422 without reason | yes | Working |
| Cashier | super_receptionist | payment queue readable | `CashierBatch3SystemTest` | 200 | yes | Working |
| Cashier | cashier | confinement proof → verify → paid (async scanner) | `phase4-payment-workflow.spec.js` | full chain | yes | Working |
| Cashier | cashier | boarding itemized billing chain | `boarding-billing.spec.js` | add-on → verify → settle → receipt → revenue | yes | Working |
| Cashier | cashier | POS responsive + dashboard + deep links + live POS | `cashier-*`, `live-pos` specs | pass | yes | Working |

## Batch 4: Veterinary

| Area | Role | Check | Coverage | Result | Evidence | Auto? | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Veterinary | veterinary | all 11 `/veterinary/*` routes render | `batch4-veterinary-system.spec.js` | render, no uncaught errors | yes | Working |
| Veterinary | veterinary | blocked from other portals | `batch4-veterinary-system.spec.js` | redirect to `/veterinary` | yes | Working |
| Veterinary | veterinary | dashboard/appointments/patients/history role gate | `VetBatch4SystemTest` | 401 guest, 403 customer+cashier, 200 vet | yes | Working |
| Veterinary | veterinary | confinements, consultations, reports queues | `VetBatch4SystemTest` | all 200 | yes | Working |
| Veterinary | vet_tech | excluded from vet-only queue per `role:veterinary,vet` | `VetBatch4SystemTest` | 403 | yes | Working |
| Veterinary | veterinary | dashboard, boarders room, responsive audit | `vet-dashboard`, `veterinary-boarders-room`, `veterinary-responsive-audit` | 11 pass | yes | Working |

## Batch 5: Inventory

| Area | Role | Check | Coverage | Result | Evidence | Auto? | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Inventory | inventory | all 16 `/inventory/*` routes render | `batch5-inventory-system.spec.js` | render, no uncaught errors | yes | Working |
| Inventory | inventory | blocked from other portals | `batch5-inventory-system.spec.js` | redirect to `/inventory` | yes | Working |
| Inventory | inventory | dashboard/items/low-stock/expiry/history role gate | `InventoryBatch5SystemTest` | 401 guest, 403 customer+cashier, 200 inventory | yes | Working |
| Inventory | inventory | reports and monthly-audit views | `InventoryBatch5SystemTest` | all 200 | yes | Working |
| Inventory | inventory | item create validates input | `InventoryBatch5SystemTest` | 422 on empty payload | yes | Working |
| Inventory | admin + super_receptionist | items list access | `InventoryBatch5SystemTest` | both 200 (composite role resolves inventory) | yes | Working |
| Inventory | inventory | stock adjust via row popover | `inventory-dashboard.spec.js` | Adjust Stock opens from row actions | yes | Working |

## Batch 6: Manager

| Area | Role | Check | Coverage | Result | Evidence | Auto? | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Manager | manager | all 20 `/manager/*` routes render | `batch6-manager-system.spec.js` | render, no uncaught errors | yes | Working |
| Manager | manager | 9 redirect routes go to the right target | `batch6-manager-system.spec.js` | payroll/leaves/schedule/reservations/payments/inventory/customers/kiosk redirects | yes | Working |
| Manager | manager | blocked from other portals | `batch6-manager-system.spec.js` | redirect to `/manager` | yes | Working |
| Manager | manager | dashboard/staff/people/reports role gate | `ManagerBatch6SystemTest` | 401 guest, 403 customer+cashier, 200 manager | yes | Working |
| Manager | admin | manager workspace access | `ManagerBatch6SystemTest` | 200 | yes | Working |
| Manager | manager | attendance contract, payroll scope, dashboard, responsive | `manager-attendance-contract`, `manager-payroll-scope`, `manager-dashboard`, `manager-responsive-audit` | pass after fixture/selector fixes | yes | Working |

## Batch 7: Admin

| Area | Role | Check | Coverage | Result | Evidence | Auto? | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Admin | admin | all 24 `/admin/*` routes render | `batch7-admin-system.spec.js` | render, no uncaught errors | yes | Working |
| Admin | admin | reaches every staff portal (all-access) | `batch7-admin-system.spec.js`; `admin-dashboard.spec.js` | receptionist/cashier/inventory/manager/vet | yes | Working |
| Admin | admin | blocked from customer portal | `batch7-admin-system.spec.js` | redirected away from `/customer` | yes | Working |
| Admin | admin | dashboard role gate — 6 other roles 403 | `AdminBatch7SystemTest` | 401 guest, 403 each staff role, 200 admin | yes | Working |
| Admin | admin | users list, inventory views, user-create validation | `AdminBatch7SystemTest` | 422 on empty payload | yes | Working |
| Admin | admin | delete-user modal reason workflow | `admin-dashboard-revisions.spec.js` | reason dropdown, Other reveals detail | yes | Working |
| Admin | admin | landing-page section editing and image upload | `LandingPageContentAdminTest` | list/show/update/upload; invalid section 422; customer 403; guest 401; public endpoint reflects update | `LandingPageContentAdminTest.php` | Working |
