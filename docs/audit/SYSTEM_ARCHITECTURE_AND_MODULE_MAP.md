# System Architecture & Module Map

**Date:** 2026-11-17 · **Baseline:** `39b3c48` + uncommitted payroll/currency work

## Stack

React 18 + Vite SPA → `src/api/client.js` → Laravel 12 API (`ApiTokenAuth` + `EnsureRole` middleware, Sanctum tokens) → MySQL, 93 tables / 184 migrations / 76 models / **722 API routes**.

## Route inventory (api/* prefixes)

`api/admin` 123 · `api/manager` 107 · `api/receptionist` 81 · `api/veterinary` 78 · `api/customer` 75 · `api/cashier` 52 · `api/inventory` 51 · `api/chatbot` 20 · `api/boarding(s)` 26 · `api/grooming` 11 · `api/auth` 11 · `api/attendance*` 16 · `api/pets` 9 · `api/notifications` 9 · `api/billing` 7 · `api/hotel-rooms` 6 · `api/files` 6 · `api/my-*` self-service ~10 · misc ~10

## Module map

| Module | Frontend | Backend | Database (source of truth) | Roles | Status |
| --- | --- | --- | --- | --- | --- |
| Authentication | `Login`, `Register`, `AuthContext` | `api/auth/*`, `ApiTokenAuth` | `users`, `personal_access_tokens`, `email_verification_tokens`, `password_reset_tokens`, `login_logs`, `sessions` | all | Implemented |
| Customer | `CustomerRoutes` (`/customer/*`): pets, bookings, hotel/grooming/vet forms, payments, history, notifications | `api/customer/*`, `api/pets`, `api/boardings`, `api/service_requests` | `customers`, `pets`, `service_requests`, `booking_requests`, `customer_orders(+_items)`, `boardings`, `boarding_room_reservations` | customer | Implemented |
| Receptionist | `ReceptionistRoutes`: bookings, walk-ins, approvals, room assignment | `api/receptionist/*` | `appointments`, `grooming_appointments`, `boarding_rooms`, `hotel_rooms`, `ward_beds` | receptionist, super_receptionist | Implemented |
| Cashier | `CashierRoutes`: POS, payment verification, sales, history, reports, payroll | `api/cashier/*`, `api/billing` | `sales`, `sale_items`, `payments`, `payment_references`, `payment_receipts`, `payment_settlements(+_items)`, `receipt_extractions`, `clinic_payment_accounts` | cashier, super_receptionist | Implemented |
| Inventory | `InventoryRoutes`: dashboard, unified inventory, batches, audits, suppliers, barcode | `api/inventory/*` | `inventory_items`, `inventory_batches`, `inventory_logs`, `inventory_monthly_audits`, `suppliers`, `service_item_usages` | inventory, admin | Implemented |
| Veterinary | `VeterinaryRoutes`: appointments, medical records, diagnostics, prescriptions, confinement, vaccinations | `api/veterinary/*`, `api/appointments` | `appointments`, `medical_records(+_addenda)`, `medical_attachments`, `medical_confinements`, `medical_progress_notes`, `prescriptions`, `vaccinations`, `diagnostic_orders(+_results)`, `visit_invoices(+_lines,+_adjustments)`, `visit_consents`, `medication_administration_records`, `ward_beds` | veterinary, vet_tech | Implemented |
| Boarding | customer `HotelForm` + receptionist room assignment | `api/boarding*`, `api/hotel-rooms` | `boardings`, `boarding_rooms`, `hotel_rooms`, `boarding_room_reservations`, `boarding_care_logs`, `booking_addons`, `add_ons` | customer, receptionist | Implemented |
| Grooming | customer `GroomingForm` + receptionist scheduling | `api/grooming`, `api/service_requests` | `groomings`, `grooming_appointments`, `service_requests` | customer, receptionist | Implemented |
| Payroll/HR | `manager/*`: PayrollManagement, PayrollComputation, GovernmentRemittance, ThirteenthMonth, SalaryLoan, attendance, leave, day-offs | `api/manager/payroll*`, `api/attendance*`, `api/my-payroll`, `api/my-leaves`, `api/my-loans` | `payrolls`, `attendance`, `attendance_records`, `attendance_corrections`, `leave_requests`, `leave_balances`, `salary_loans`, `thirteenth_month_accruals`, `employee_day_offs`, `employees`, `holidays`, `biometric_credentials` | manager, admin; self-service all staff | Implemented (finalized) |
| Reports | per-role report components + `UnifiedReportEngine` | `api/{role}/reports*`, `api/admin/*` | `report_alerts`, `report_alert_history`, `activity_logs` | all staff | Implemented |
| Notifications/Email | `NotificationCenter`, per-role badges | `api/notifications` | `notifications`, `email_deliveries` (outbox), `recall_dispatches`, `live_chat_*`, `chatbot_*` | all | Implemented |
| Admin | user mgmt, settings, logs, landing content | `api/admin/*`, `api/settings` | `users`, `system_settings`, `activity_logs`, `landing_page_contents`, `gift_cards`, `provider_configs`, `services` | admin | Implemented |
| POS / commerce | `CashierPOS` | `api/cashier/*` | `sales`, `sale_items`, `payments`, `payment_settlements` | cashier | Implemented |

## Table disambiguation (source of truth per workflow)

- **`boarding_rooms` vs `hotel_rooms`** — both exist; boarding flow uses `boarding_room_reservations` + `boarding_rooms`; `hotel_rooms` + `ward_beds` serve the hotel/boarding catalog — NOT merged; treat `boardings` as the record of truth, rooms as inventory.
- **`sales` vs `payments` vs `invoices`** — `sales` = POS/service transaction header; `sale_items` = lines; `payments` = settlement records linked `sale_id`; `payment_settlements` = verified customer-payment groupings; `visit_invoices` = veterinary-side billing; `invoices` = legacy/payment-request invoices. Not interchangeable.
- **`service_requests` vs `appointments` vs `groomings`** — `service_requests` is the intake record; `appointments` is the scheduled vet visit; `groomings`/`grooming_appointments` are the grooming lifecycle.
- **`customer_orders` vs `sales`** — customer product orders (online) vs cashier POS sales.

## Known architectural notes

- Customer product-order checkout is deliberately disabled (410) — descoped, not a defect.
- `super_receptionist` (composite) and `vet_tech` exist beyond the 7 primary roles; `payroll` enum value unused; `super_admin` merged into `admin`.
- `service_requests.customer_id` stores a user ID while `pets.customer_id` references `customers` — per-resource ownership mapping (documented in `SYSTEM_ARCHITECTURE_AUDIT.md`).
- Unrouted legacy `PayrollController` methods exist as dead code (documented L-01).
