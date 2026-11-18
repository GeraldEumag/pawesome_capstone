# Customer Role — Scope Discovery (Gate 1)

**Audit:** Customer Role Final System-Wide Audit
**Date:** 2026-11-18
**Stack audited:** isolated `pawesome_customer_audit` DB, API `:8001`, frontend `:3001`
**Baseline HEAD:** `21a71b7` (clean)

## 1. Execution environment

| Item | Value |
| --- | --- |
| Laravel | 12.72.0 (PHP 8.2.12) |
| Frontend | React 18 + Vite, dev server `:3001` → `VITE_API_BASE_URL=http://127.0.0.1:8001/api` |
| API | `php artisan serve` `:8001`, `DB_DATABASE=pawesome_customer_audit`, `APP_TIMEZONE=Asia/Shanghai` (client OS tz) |
| DB engine | MariaDB 10.4.32 (XAMPP). CI MySQL 8 parity is a documented limitation |
| Mailer | `MAIL_MAILER=smtp` → Brevo relay (`smtp-relay.brevo.com:587`), real sends enabled |
| Queue | `sync` |
| Config/route cache | NOT CACHED (env overrides verified effective — write-probe landed in audit DB, 0 writes in dev `pawesome`) |
| Storage | local `storage/app/{private,public}` — shared repo path; random file names make cross-stack collision nil. NOTE: `PRIVATE_STORAGE_ROOT`/`PUBLIC_STORAGE_ROOT` env roots apply only to non-local drivers, so file-path isolation is DB-row-level only on this stack. |

Seed state (audit DB): 9 users (admin/manager/receptionist/super_receptionist/cashier/inventory/vet/vet_tech/customer — all pre-verified), 29 services, 7 boarding_rooms, 837 inventory_items, 0 customers/pets/requests (fresh workflow data created by the audit).

## 2. Customer frontend inventory

Routes mount under `/customer/*` via `frontend/src/routes/CustomerRoutes.jsx` inside `CustomerDashboard` (ProtectedRoute → `role:customer`).

| Route | Component | Purpose |
| --- | --- | --- |
| `/customer` (index) | → `/customer/services` | Landing redirect |
| `/customer/services` | `CustomerServices` | Service catalog + booking entry points |
| `/customer/bookings` | `CustomerRequestStatus` (bookings board `cbb-*`) | My Requests: tabs by status, live status view |
| `/customer/booking` → `/customer/services` | Navigate | Legacy alias |
| `/customer/requests` → `/customer/bookings` | Navigate | Legacy alias |
| `/customer/pets` | `CustomerPets` | Pet CRUD, archive, photos, medical-history modal |
| `/customer/hotel` | `HotelForm` | Boarding/hotel reservation wizard |
| `/customer/grooming` | `GroomingForm` | Grooming request wizard |
| `/customer/vet` | `VetForm` | Veterinary appointment wizard |
| `/customer/medical-confinements` | `CustomerMedicalConfinements` | Confinement records, care logs, progress notes, proof upload |
| `/customer/profile` | `shared/ProfileSettings` | Profile edit, password change, photo |
| `/customer/history` | `CustomerHistory` | Transactions/orders/boardings history (read) |
| `/customer/notifications` | `CustomerNotifications` | Notification list, read/unread |
| `/customer/payments` | `CustomerPayments` | Payables, proof upload, receipts |
| `/customer/reports` + `/reports/payments` | `CustomerReports`/`CustomerPayments` | Personal report views |

Supporting shared components used by the customer flow: `ServiceBookingModal` (landing-page pre-login booking), `BookingReviewModal`, `Modal`, `StatusBadge`, `DatePickerInput`, `PetAvatar`, `DashboardProfile`, chatbot widget (`rbac-chatbot-*`, live chat), `NotificationDropdown`.

**Store/cart/checkout UI: confirmed ABSENT.** No `Shop`/`Cart`/`Checkout`/`Store` component or nav entry exists — F-02 descope verified at the UI level. `CustomerHistory`/`CustomerPayments` still read legacy `store/orders` data.

## 3. Backend surface (customer-reachable)

Groups (see `CUSTOMER_API_MAPPING.md` for the full per-route table):

| Surface | Middleware | Controllers |
| --- | --- | --- |
| `api/customer/*` (~70 routes) | `auth.api`, `throttle:api`, `role:customer` (+`verified` on mutating POSTs) | `Customer\PortalController`, `ServiceRequestController`, `BoardingController`, `GroomingController`, `PetController`, `Customer\VeterinaryBillingController`, `MedicalConfinementController`, `Customer\ReceiptController`, `Customer\BookingBoardController`, `AvailabilityController`, `CustomerStoreController`, `Veterinary\MedicalRecordController` |
| `api/customer/pets/*` | same group | `PetController` (CRUD/archive) |
| `api/customer/grooming/*` | same group | `GroomingController` |
| `api/pets/*`, `api/customers*` shared | `role:receptionist,admin,manager,customer` | controllers self-scope by role |
| `api/notifications/*` | `auth.api` (self-scoped) | `NotificationController` |
| `api/files/*` | `auth.api` | `SecureFileController` (owner/staff authz per file type) |
| `api/chatbot/*` + `live-chat` | `auth.api` (+`role:customer` on customer session routes) | `SharedChatbotController`, `ChatbotWorkflowController`, `LiveChatController` |
| `api/auth/*` | public + `auth.api` | `AuthController` (register/login/logout/me/profile/verify/password) |
| Public reads | `throttle:api` only | `availability/*`, `public/boarding-rooms`, `boarding/rooms*`, `boarding/add-ons`, `holidays/blocked`, `services` |
| **Retired (descoped)** | `role:customer` + `verified` | `store/checkout`, `store/orders/{id}/cancel`, `store/orders/{id}/payment-proof` → **410**; `store/orders*` GETs live read |

## 4. Ownership conventions (server-side)

Two `customer_id` domains coexist — both documented conventions, verified in code:

| Tables | `customer_id` refers to | Enforcement |
| --- | --- | --- |
| `pets`, `boardings`, `groomings`, `appointments`, `medical_confinements`, `sales` | `customers.id` | `PetController::customerOwnsPet` (404), `BoardingController::customerCanAccess` (customers.id + pet_id + customer_email fallbacks), `MedicalConfinementController::customerCanAccess` (404) |
| `service_requests`, `notifications`, `customer_orders` | `users.id` | `ServiceRequestController` `customer_id = Auth::id()` on create, `customer_id = $user->id` scoping on reads |
| Mixed (receipt scanner) | either | `Customer\ReceiptController::userOwnsPayable` handles both domains + `customer_email` fallback |

`Customer::firstOrCreate` in `PetController::store` self-heals a missing `customers` row on first pet create.

## 5. Business rules discovered (to be probed in Gates 2–3)

- `verified` middleware blocks unverified customers from every booking/proof/billing POST; staff exempt; login allowed.
- `service_requests` require `pet_id` (`exists:pets,id`) + owner check; pet name/type derived server-side.
- Boarding: vaccination card **required** for customer-submitted online boardings; SR hotel approval transactionally requires `boarding_room_id`, rechecks availability, creates `boarding_room_reservations` (`source_type='service_request'`); reject/cancel releases the reservation.
- Payment proof upload → `payment_status='pending'` only; verification is cashier-only. Reject→resubmit propagates SR↔linked record bidirectionally.
- `booking_channel` (`online`/`walk_in`) gates counter-cash: online rows with pending digital proof can only verify as proof.
- Receipt scanner: `payment_reference` optional at upload (scanner auto-fills), `receipt_validations` `block` rows disable cashier Confirm.
- `customer/*` POSTs are idempotency-sensitive (dedup via notifications, receipt occurrence keys, POS per-user locks elsewhere).

## 6. Baseline test results (before any audit changes)

| Suite | Result |
| --- | --- |
| Backend customer-scoped (13 test classes, `pawesome_test`) | **133 passed / 636 assertions, 0 failures** |
| Playwright customer specs on audit stack (8 files, 52 tests) | 44 pass + 3 fail + 5 dependent-skips → **harness defect found & fixed** (see below) → rerun 8/8 pass ⇒ **52/52** |

### Baseline finding — CUST-H01 (harness, not app)

`customer-my-requests-link.spec.js`, `customer-bookings-board.spec.js` (and 9 sibling specs) built the API base as `${E2E_API_URL}/api` unconditionally, producing `/api/api/*` whenever `E2E_API_URL` already ended in `/api` (the convention used by `test-utils.js`/`audit-guard.js`). Peer specs already normalize via `.replace(/\/api\/?$/, "")`. **Fix applied:** normalized all 11 files to the tolerant convention. Files: `cashier-payment-deep-link`, `customer-bookings-board`, `customer-dashboard-revisions`, `customer-my-requests-link`, `manual-e2e-chain{,2,3,4}`, `manual-verification-pass`, `receptionist-dashboard`, `receptionist-later-bookings`. Verified: 8/8 previously-failing tests pass.

## 7. Dependencies on other roles (customer flows land here)

| Customer action | Lands in staff module |
| --- | --- |
| `POST /customer/requests` (vet/grooming) | `service_requests` → receptionist approvals/schedule; vet queue after approval |
| `POST /customer/boardings` | `service_requests`/`boardings` → receptionist room assignment + card verification |
| payment-proof uploads (request/boarding/confinement/billing) | cashier `payment-requests` queue → `PaymentVerificationService` |
| `POST /chatbot/live-chat/start` | receptionist/admin live-chat inbox |
| confinement records | veterinarian-entered data (read-only for customer) |

## 8. Out-of-scope / retired surfaces (verified, not defects)

- Customer product ordering (store/cart/checkout) — F-02 approved descope; 410 stubs + read-only legacy order history.
- `ReceptionistCustomerOrders.jsx` — deleted unrouted dead component (prior phase).
- `customer/orders/history`, `reports/orders` — read-only legacy `customer_orders` reads (kept for financial evidence).

## 9. Open questions for Gate 2 probing

- Do all `files/*` viewers authorize per owner for every payable type (proofs, receipts, vacc cards, pet photos, care-log photos)?
- Are all customer POST mutations idempotent under double-submit (requests, boardings, proofs, reference submission)?
- Does `submitReference`/`receipts/{type}/{id}` cover every payable type a customer can own?
