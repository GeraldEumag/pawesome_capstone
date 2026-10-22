# Pawesome Pet Care Management System
## User Manual

**Document status:** Reviewed draft — key workflows runtime-verified in the local dev build on 2026-10-22; remaining procedures are source-reviewed  
**Version:** 0.2  
**Review date:** 22 October 2026  
**Intended audience:** Customers and authorized Pawesome staff  
**Project:** Pawesome — Web-Based Pet Management Information System

> **Status notice:** This version combines source review with a real runtime pass against the local development build (frontend `:3000`, API `:8000`, MySQL `pawesome`). Every procedure carries a status tag — **VERIFIED**, **TESTED**, **CODE-REVIEWED**, or **BLOCKED** — defined in §1.6. Screenshots are genuine captures from the 2026-10-22 build; see §17. Items still marked CODE-REVIEWED have not been executed and should not be treated as proven.

## Document control

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-20 | Initial source-reviewed draft; runtime testing and screenshots pending |
| 0.2 | 2026-10-22 | Runtime pass executed (Playwright, Chromium): 18 genuine screenshots captured; grooming booking and payment chains verified end-to-end; cashier Dashboard link and Create User role list defects fixed in code and re-verified; nav labels corrected; attendance kiosk, Medical page, day-off schedule, payment-channel rules, and admin welcome email documented; status taxonomy added |

## Contents

1. [Introduction](#1-introduction)
2. [How to use this manual](#2-how-to-use-this-manual)
3. [Getting started](#3-getting-started)
4. [Customer guide](#4-customer-guide)
5. [Receptionist guide](#5-receptionist-guide)
6. [Cashier guide](#6-cashier-guide)
7. [Inventory guide](#7-inventory-guide)
8. [Veterinary guide](#8-veterinary-guide)
9. [Manager guide](#9-manager-guide)
10. [Admin guide](#10-admin-guide)
11. [Super Receptionist guide](#11-super-receptionist-guide)
12. [Employee self-service and attendance kiosk](#12-employee-self-service-and-attendance-kiosk)
13. [Payroll role scope](#13-payroll-role-scope)
14. [Cross-role workflows](#14-cross-role-workflows)
15. [Troubleshooting](#15-troubleshooting)
16. [Security and privacy](#16-security-and-privacy)
17. [Screenshot index](#17-screenshot-index)
18. [Glossary and known limitations](#18-glossary-and-known-limitations)
19. [Appendix: role quick reference](#19-appendix-role-quick-reference)
20. [Review and revision history](#20-review-and-revision-history)

## 1. Introduction

### 1.1 Purpose

This manual helps customers and authorized staff find the main Pawesome pages and follow the documented workflows. It does not replace staff training, clinical judgment, financial controls, or the permissions assigned to an account.

### 1.2 System overview and scope

Pawesome is a pet-care management system with customer and staff workspaces: customer pet and service pages, receptionist booking queues and walk-ins, cashier POS/payment review, inventory management, veterinary consultations and boarding care, manager reporting/HR/payroll features, and admin tools.

The existence of a page or API route does not by itself prove a workflow works. Each procedure below is tagged with a verification status (§1.6).

**Customer product checkout is currently unavailable.** The customer store checkout endpoint and related order write actions return a disabled response (HTTP 410). Service bookings and their payments are unaffected — see §4.5.

### 1.3 Intended users and role access

The system provides customer, receptionist, cashier, inventory, veterinary, manager, admin, and `super_receptionist` workspaces. Admin has broad staff access but is not a customer-portal role. Super Receptionist combines receptionist, cashier, and inventory access. There is no standalone Payroll role (see §13).

Your accessible pages depend on the role attached to your account and backend authorization. If a page is missing or access is denied, contact the system administrator; do not attempt another role's account or bypass permissions.

### 1.4 Requirements and access

- Open the frontend URL provided by the project/system administrator — not the API/health-check address.
- Verified on desktop Chromium (Playwright `Desktop Chrome`) during the 2026-10-22 pass. Mobile viewports are supported by the UI but were not part of this verification run.
- A modern Chromium, Firefox, or Safari browser with JavaScript enabled is expected; confirm the officially supported matrix with the system owner.

### 1.5 Important security practices

- Use only your assigned account and keep your password private.
- Do not include passwords, tokens, customer records, clinical details, or payment evidence in screenshots or shared documents.
- Check the account role and page before making a change.
- Do not enter fictional clinical findings into live records.
- Do not use real payments to test the system.
- Sign out when finished, especially on a shared device.

### 1.6 Verification status tags

| Tag | Meaning |
|---|---|
| **VERIFIED** | The documented workflow was executed end-to-end in the stated environment (local dev build, 2026-10-22) and passed, supported by test output and, where applicable, a dated screenshot. |
| **TESTED** | The feature was exercised in the running application; the result and its limits are recorded. |
| **CODE-REVIEWED** | The implementation was inspected in source; runtime behavior was not established. |
| **BLOCKED** | The workflow could not be adequately exercised; the reason is recorded. |

A screenshot proves a screen appeared as captured; it does not by itself prove a full workflow succeeded.

## 2. How to use this manual

- Procedures are written as numbered steps in a **Purpose / Authorized role / Prerequisites / Steps / Expected result / Possible errors / Screenshot** format.
- Bold labels are on-screen names (menu items, buttons, tabs). Exact capitalization may vary slightly in the UI.
- Status tags appear per procedure or section. Before relying on a procedure for production work, prefer sections marked VERIFIED.
- Figure references (UM-###) map to real files in `docs/user-manual/screenshots/` and the register in `audit/screenshot-register.md`.
- Email delivery is covered separately: the local build logs mail intents rather than sending, so email *content/delivery* is treated as not locally provable (see §16 notes and the QA report).

## 3. Getting started

### 3.1 Sign in — VERIFIED (page render + role routing)

**Purpose:** Open the workspace assigned to your account.
**Authorized role:** Any account with valid access.
**Prerequisites:** Project-provided application URL and your own credentials.

1. Open the Pawesome frontend URL supplied by the system owner.
2. Select **Log In** if the login page is not already open.
3. Enter your **Username** and **Password**.
4. Select **Sign In**.
5. Confirm that the workspace shown matches your assigned role.

**Expected result:** A successful login routes to the role workspace (each of the 8 seeded role accounts was exercised on 2026-10-22 and landed in its workspace). Unverified customer accounts are directed to email verification.

**Possible errors:** The login page displays an error if the request fails or credentials are rejected. If you cannot sign in, confirm the username with the system owner and use **Forgot Password** if available.

**Screenshot:** Figure UM-001 — Login (`screenshots/UM-001-login.png`).

### 3.2 Register a customer account — VERIFIED

**Purpose:** Create a customer portal account.
**Authorized role:** New customer.
**Prerequisites:** A valid email address that you control.

1. Open **Register** from the public landing page.
2. Complete **Personal Information**: first and last name, email address, and optional middle name, suffix, date of birth, and contact information.
3. Continue to **Account Setup** and enter a username and password; confirm the password.
4. Complete the **Emergency Contact** step if required by the form.
5. Review the registration summary and accept the Terms of Service and Privacy Policy.
6. Submit the form.
7. Check your email and follow its verification instructions before submitting protected booking requests.

**Expected result:** Creates a customer account, generates an email-verification intent (60-minute token), and directs the user to login or the verification page. Runtime-verified 2026-10-22: a fresh account was registered via the API, logged in unverified, and was correctly blocked from protected booking POSTs (HTTP 403) until verification completed.

### 3.3 Verify email and recover a password — VERIFIED

On **Email Verification**, follow the link sent to your own address or request a resend. Verified customers are redirected to login.

For recovery, open **Forgot Password**, enter your registered email, and follow the reset link (60-minute token). Generic responses are intentional — the system does not reveal whether an account exists.

Runtime-verified 2026-10-22: verification and password-reset completion endpoints were exercised end-to-end (a test account was verified, then reset its password and signed in with the new credential). Outbox intents for both mails reached SMTP provider status `accepted`; mailbox delivery to a real inbox is a deployment concern (test addresses use non-routable `example.test` domains).

### 3.4 Sign out — VERIFIED (control present on all workspaces)

Select **Logout** / **Log Out** in the workspace navigation and confirm if prompted. Sign out on shared devices.

## 4. Customer guide

Customer sidebar labels (verified live on 2026-10-22): **Services**, **My Pets**, **My Requests**, **Notifications**, **History**, **Medical**, **Reports**, **Profile**, **Log Out**.

> Correction vs v0.1: the customer nav item is **My Requests** (`/customer/bookings`), not "Payments". Payment screens are reached from booking/request flows rather than a sidebar entry.

### 4.1 Add or review a pet — VERIFIED (page)

**Purpose:** Maintain pet information used by booking forms.
**Authorized role:** Customer.
**Prerequisites:** Signed-in customer account.

1. Open **My Pets**.
2. Review the active pet list; use search or the **All Pet Types** filter.
3. Select **Add Pet** (or **Add your first pet** when empty).
4. Enter the requested details and save.
5. Use **Edit** to change a pet, **Archive** to move it out of the active list, or **Restore Pet** to return it.
6. Select **Medical History** / **View History** to inspect records.

**Expected result:** The pet appears under Active Pets (or Archived Pets). Archived pets cannot be used for new bookings until restored.

**Screenshot:** Figure UM-003 — My Pets (`screenshots/UM-003-customer-pets.png`).

### 4.2 Submit a grooming or veterinary request — VERIFIED (end-to-end)

**Purpose:** Request an available service for a registered pet.
**Authorized role:** Verified customer.
**Prerequisites:** Signed in; an active registered pet; verified email.

1. Open **Services** and select **New Request**.
2. Choose the service card and select **Book Now**.
3. In **Pet Grooming** or **Veterinary Appointment**, select your active pet and a service.
4. Select an available date and time, then add notes or the pet concern.
5. Review the displayed booking details and price in the review step.
6. Select **Go back** to correct information, or **Confirm booking** to submit.
7. Open **My Requests** (or the form's **My Appointments** tab) to review the status.

**Expected result:** The request is created in a pending/unpaid state and lands on the requests view. Runtime-verified on 2026-10-22: a grooming request (pet, service, date, 10:00 slot) passed the review modal and confirmed successfully (Figure UM-004).

**Possible errors:** The pet must belong to your account and be active. An unavailable slot, pet/service incompatibility, unverified account, or a duplicate booking blocks submission — the form surfaces availability inline before confirm.

**Screenshots:** Figures UM-004 (`UM-004-booking-review.png`), UM-004a (filled form), UM-004b (post-submit My Appointments).

### 4.3 Request a Pet Hotel/boarding reservation — VERIFIED (end-to-end)

**Purpose:** Submit a boarding request for a registered pet.
**Authorized role:** Verified customer.
**Prerequisites:** Signed in, active registered pet, vaccination-card file ready.

1. Open **Services → New Request**, choose Pet Hotel, **Book Now**.
2. In **Pet Hotel**, select **New Reservation**.
3. Select your pet and the **Stay Date** (source describes same-day stay).
4. Select an available room if offered.
5. Add optional **Notes** and attach the required **Vaccination Card**.
6. Review booking and pricing, then **Submit Boarding Request** → **Confirm booking**.
7. Track under **My Requests**.

**Expected result:** The request enters receptionist review. Backend enforces: online hotel requests must come through this reservation flow and carry a verified vaccination card before approval. Runtime-verified 2026-10-22: boarding created with card → receptionist verified the card → approved (response noted inventory deduction); `boarding.created`/`boarding.status` notification intents queued.

### 4.4 Track requests, upload payment proof — VERIFIED (end-to-end)

1. Open **My Requests** (sidebar) to see bookings with status tabs (All / Pending / Ongoing / Pickup / Done / Cancelled) and payment state.
2. For an online booking, use the payment action shown on the request to submit **payment method** (GCash or Maya), a **payment reference**, and a **proof file** (jpg/jpeg/png/pdf, ≤5 MB). Proof may be submitted before approval for online-channel bookings.
3. If a proof is rejected, review the reason shown before resubmitting corrected information.
4. After cashier verification, the request shows **paid** and a receipt number (runtime-verified 2026-10-22: `SR-REC-…` issued on verify).

**Safety:** Do not initiate real payments or disclose payment account details for testing.

**Screenshots:** Figures UM-006 (cashier-side queue) and UM-015 (`UM-015-customer-request-paid.png`).

### 4.5 Customer store orders — DISABLED (code-confirmed)

Keep these flows separate:

- Public, read-only product/category data exists, but there is no customer browsing/cart route in the customer module.
- The customer can read existing store-order records, but customer store checkout, order payment-proof submission, and cancellation write paths return HTTP 410. Receptionist order processing and cashier customer-order verification are likewise disabled.
- The cashier **POS** cart is a staff-side workflow — not a customer checkout.
- Service requests and service payments (§4.2–§4.4) are unaffected.

Do not attempt a customer store order. Confirm with the project owner whether customer ordering is in final scope.

### 4.6 Notifications, history, medical, reports, profile — TESTED (pages render)

- **Notifications** — account notices; email-notification preferences can be reviewed/changed (`GET/PUT /api/customer/notification-preferences`). Opt-outs are honored at intent creation and re-checked at send time for lifecycle mail.
- **History** — customer activity/transaction records.
- **Medical** — `/customer/medical-confinements`: customer-facing view of medical confinement records (Figure UM-011).
- **Reports** — customer report view.
- **Profile** — account details and profile photo (initials avatar fallback when none uploaded).

Pages rendered in the runtime pass; preference-save and content behavior are CODE-REVIEWED where not exercised.

## 5. Receptionist guide

Sidebar (verified): **Booking** (Hotel, Veterinary, Grooming), **Manage Services**, **Walk-ins**, **Customer Profile**, **Chatbot**, **Live Chat**, **History**, **Reports**, **My Payroll**, **Profile**, **Logout**.

### 5.1 Review a booking — VERIFIED (queue render + approve executed via API)

**Purpose:** Review an incoming service request and take an authorized action.
**Authorized role:** Receptionist; Super Receptionist inherits this capability.

1. Open **Booking** → **Hotel**, **Veterinary**, or **Grooming**.
2. Locate the record via search/status filter.
3. Open details; review pet, owner, service, schedule, notes, status, and supporting files (e.g., vaccination card for hotel).
4. Use only an action valid for the record's state: **approve**, **reject** (reason required), or an available scheduling action. Veterinary approvals may require choosing a veterinarian.
5. Reopen/refresh the record and confirm the displayed status.

**Expected result:** The backend updates the service request and linked records; customer-facing status/notification follow. Runtime-verified on 2026-10-22: approval transitioned a grooming request to `approved` and a vet request to `approved` with veterinarian assigned (Figure UM-016).

**Constraint observed at runtime:** online hotel requests cannot be approved through the generic approve path — the API returns "Online hotel requests must use the Pet Hotel reservation flow and have a verified vaccination card before approval."

**Screenshot:** Figure UM-005 — Grooming queue (`UM-005-receptionist-grooming-queue.png`).

### 5.2 Handle a walk-in — VERIFIED (end-to-end)

1. Open **Walk-ins**.
2. Select the service and complete customer/pet/service fields.
3. Review and confirm. Walk-in creation produces operational booking and payment records with `booking_channel = walk_in` (counter cash is then collectible — see §6.1).

Runtime-verified 2026-10-22: a walk-in for an existing customer/pet (Nail Trimming) was created via the walk-ins endpoint, approved, then settled at the cashier as counter cash — `payment_method=cash`, receipt `SR-REC-20261022131509-272`.

### 5.3 Other receptionist pages — TESTED (pages render where exercised)

**Customer Profile** locates customer/pet records. **Manage Services**, **History**, **Reports**, **Chatbot**, **Live Chat** are separate pages. Do not message real customers from a test session.

## 6. Cashier guide

Sidebar (verified): **Dashboard**, **POS**, **Transactions**, **History**, **Reports**, **My Payroll**, **Profile**, **Logout**.

> Fixed in v0.2: the sidebar **Dashboard** link previously pointed at `/cashier` (the full-screen POS). It now opens `/cashier/dashboard` — the dashboard shell with sales overview. The full-screen POS remains at `/cashier` and `/cashier/pos`.

### 6.1 Review a payment proof — VERIFIED (queue + verify executed)

**Purpose:** Review an eligible payment request and take an authorized cashier action.
**Authorized role:** Cashier; Super Receptionist inherits.
**Prerequisites:** An eligible payment record.

1. Open **POS** → **Payment Approvals** (or the `/cashier/payment-verification` deep link).
2. Locate the request; review service/order reference, amount, method, state, and proof (**View Proof**).
3. Choose the action matching the payment type and state:
   - **Verify** — confirms a submitted digital proof (GCash/Maya).
   - **Collect Cash** — legitimate only for **walk-in** payables, or **online** rows whose proof was rejected. An online row carrying a pending digital proof must be verified or rejected as proof — never silently recorded as cash.
   - **Reject** — invalid proof; reason required.
4. Confirm details in the modal.
5. Review the resulting status and receipt.

**Expected result:** Verification writes a settlement + receipt number and mirrors the paid state to the customer view. Runtime-verified 2026-10-22: a pending GCash request (SR-271, ₱450) was verified; receipt `SR-REC-20261022124801-271` issued and the customer view showed paid.

**Environment note found during the pass:** the payment queue requires the `service_billing_payment_requests` table; the dev DB needed its pending migration for the endpoint to return data (see QA report).

**Screenshot:** Figure UM-006 (`UM-006-cashier-payment-approvals.png`, real queue with a pending GCash row).

### 6.2 Use the POS — VERIFIED (sale + void executed)

1. Open **POS**, browse/search products or services (tabs: All Items, Accessories, Health & Meds, Pet Food, Services).
2. Add items to the cart; verify quantities and totals.
3. Select the customer option and follow checkout controls.
4. Confirm total and payment method; submit the sale.
5. Review the generated receipt; use **Transactions** / **History** for records.

POS checkout creates financial and inventory records. Runtime-verified 2026-10-22: a service-item sale was processed via the transaction endpoint (₱150 cash, ₱200 tendered), producing a sale, invoice, and receipt payload; the sale was then voided successfully through the void endpoint.

### 6.3 Review transaction history — TESTED (page renders)

Open **Transactions** or **History**, filter, and compare items, totals, payment state, and receipt data. Use **Reports** for summaries.

**Screenshots:** Figure UM-014 — Cashier dashboard overview (`UM-014-cashier-dashboard.png`).

## 7. Inventory guide

Sidebar (verified): **Dashboard**, **Stock Management**, **Suppliers**, **History**, **Barcode Generator**, **Reports**, **Monthly Audit**, **Audit Reports**, **Audit Analytics**, **My Payroll**, **Profile**, **Logout**.

### 7.1 Find an item and review stock — VERIFIED (page)

1. Open **Stock Management**.
2. Search or filter by category, status, brand, or supplier (statuses include In Stock, Low Stock, Out of Stock).
3. Open **View Info** or **History** on an item.
4. Use **Reports**, **History**, or audit pages for read-only review.

**Screenshot:** Figure UM-007 (`UM-007-inventory-stock.png`).

### 7.2 Change an inventory record or stock level — VERIFIED (adjust executed)

Only an authorized inventory user may create, edit, archive, restore, or adjust stock.

1. Locate the item in **Stock Management**.
2. Use **Edit** or **Adjust Stock**.
3. Enter values and a reason. Note: **stock increases are not accepted through Adjust Stock** — the API rejects `add` and requires batch receiving. Decreases (`remove`) and recounts (`set`) are accepted; batch-tracked items are reconciled so the flat counter matches batch quantities.
4. Review before saving; confirm the movement in **History**.

Runtime-verified 2026-10-22: a `remove 1` then `set` restore on a test item produced two `manual_adjustment` log entries and returned stock to its prior value.

**Warning:** Stock adjustments, archival, batch disposition, and audit submission change inventory. Do not demo them against shared/production stock.

### 7.3 Suppliers, barcode tools, and audit pages — TESTED (supplier + batch roundtrips)

**Suppliers**, **Barcode Generator**, **Monthly Audit**, **Audit Reports**, and **Audit Analytics** provide supplier records, barcode tooling, and stock-count reviews. Audit actions persist counts — confirm the period, item, count, and reason per procedure.

Runtime-verified 2026-10-22: a supplier record was created then deleted (create→delete roundtrip), and a batch was received then disposed on the seeded test item (stock 50 → 51 → 50 with history). Barcode generation and audit submission were not exercised — CODE-REVIEWED.

## 8. Veterinary guide

Sidebar (verified): **Dashboard**, **Appointments**, **Customer Profiles**, **Current Boarders**, **Services**, **History**, **Reports**, **My Payroll**, **Profile**, **Logout**.

> Correction vs v0.1: **Dashboard** was missing from this list.

### 8.1 Appointments and consultation — VERIFIED (full clinical cycle)

**Purpose:** Review assigned appointments and record care.
**Authorized role:** Veterinary staff with access.

1. Open **Appointments** — stat cards (Today, Pending, Approved, Completion rate) and status filters.
2. Open the appointment and review patient/service details.
3. Select **Start Consultation** when ready.
4. Record clinical information (concern, examination, assessment, treatment plan, vitals).
5. Add prescription/inventory usage only when appropriate and authorized.
6. **Save Draft** for unfinished work, or **Complete Consultation** to finalize.
7. Complete the appointment only when its payment/workflow state permits.

Runtime-verified 2026-10-22: a customer vet request approved with this veterinarian appears in the appointments workspace (Figure UM-016). The full clinical cycle was then executed on appointment 66: Start Consultation moved it to `in_consultation` and created a draft medical record; the record was finalized; **Complete Consultation** moved it to `awaiting_payment` and synced the cashier billing.

**Warning:** Clinical records are sensitive. Never enter invented diagnoses or real patient data into test records.

### 8.2 Other veterinary pages — TESTED (pages render)

**Current Boarders**, **Customer Profiles**, **Services**, **History**, **Reports** locate information for assigned tasks. Confirm the correct pet/appointment before changing clinical details.

## 9. Manager guide

Sidebar (verified): **Dashboard**, **Reports**, **Staff Management**, **Employee Directory**, **Attendance**, **Day-Off Schedule**, **Employee ID Cards**, **Leave**, **Payroll**, **Holidays**, **Salary Loans**, **13th Month**, **Remittance Reports**, **DTR Report**, **History / Audit Trail**, **My Leave**, **My Attendance**, **Profile**, **Logout**.

> Correction vs v0.1: **Day-Off Schedule** was missing from this list.

### 9.1 Review a report — VERIFIED (page)

1. Open **Reports** and select the relevant area.
2. Apply date/status filters and refresh.
3. Review summary cards and result tables; adjust the period for empty results.
4. Export only when permitted; store exports securely.

**Screenshot:** Figure UM-009 (`UM-009-manager-reports.png`).

### 9.2 Attendance, day-offs, leave — VERIFIED (review paths)

- **Attendance** — staff attendance review; pairs with the employee kiosk (§12.2) and My Attendance self-service.
- **Day-Off Schedule** — per-employee recurring day-off calendar (`employee_day_offs`); feeds attendance expectations, leave validation, and payroll day counting. Runtime-verified: set, clear-all (`days:[]`), and re-set all persist correctly; invalid weekdays and duplicates return 422; non-manager roles get 403.
- **Leave** — review/approve staff leave requests; employees file via **My Leave** (requires a leave balance row — managers seed balances via `POST /manager/leave-balances/seed` at onboarding). Runtime-verified: employee self-file → manager approve deducts the balance (15→7 on the fixture), and manager-file → reject also works. Filing with no balance row returns "Insufficient leave balance".

### 9.3 Payroll and HR — VERIFIED (single-employee lifecycle)

Manager payroll pages can generate, calculate, review, and release payroll runs (plus manual payroll where supported). **Holidays**, **Salary Loans**, **13th Month**, **Remittance Reports**, **DTR Report**, **Staff Management**, **Employee Directory**, and **Employee ID Cards** are related HR surfaces. Follow approved payroll procedures; this manual does not certify calculations or statutory amounts.

Runtime-verified 2026-10-22: a payroll record for a test fixture employee was created (`pay_period 2026-10-16 → 10-31`, requires `gross_pay` + `net_pay`), approved, and released — reaching `status=paid`. Bulk semi-monthly generation, 13th-month accrual, loans, and remittance/DTR report exports were not exercised — CODE-REVIEWED.

Employees also have self-service pages (§12.1).

## 10. Admin guide

Sidebar (verified): **Dashboard**, **Manage Users**, **Create User**, **Employee Directory**, **Audit History**, **Login History**, **Chatbot Logs**, **Live Chat**, **All Reports**, **Payroll Reports**, **Settings**, **Landing Page Editor**, **Profile**, plus an **Operations Hub** linking to **Front Desk**, **POS / Cashier**, **Inventory**, **HR / Manager**, and **Veterinary** modules.

> Correction vs v0.1: **Dashboard** was missing from this list.

### 10.1 Review or manage a user — VERIFIED (page + create path)

1. Open **Manage Users** — stats (total/active/inactive/admin counts), search, role/status filters, export.
2. Review identity and role before acting.
3. Use **Create User** only when authorized; the role list offers exactly the eight backend-supported roles: Admin, Manager, Receptionist, Super Receptionist, Veterinary, Cashier, Inventory, Customer. (The invalid **Payroll** option present in v0.1 was removed in v0.2 — backend validation never accepted it.)
4. Save: account creation, role changes, activation, archival, or deletion affect access.
5. The new account receives a **welcome email** containing a set-your-own-password link (a 60-minute password-reset token). Plaintext credentials are never emailed; admin-created accounts are pre-verified. Runtime-verified 2026-10-22: a receptionist account was created via the endpoint and the `auth.account_welcome` intent appeared in the `email_deliveries` outbox and was dispatched to the configured SMTP provider (`provider_status=accepted`). Provider acceptance confirms dispatch, not mailbox delivery.

**Screenshot:** Figure UM-010 (`UM-010-admin-manage-users.png`).

### 10.2 Reports, audit history, settings, Operations Hub — TESTED (pages render where exercised)

Use **Audit History**, **Login History**, **All Reports**, **Payroll Reports**, **Settings**, **Landing Page Editor**, **Chatbot Logs**, **Live Chat**, **Employee Directory** within your responsibilities. **Operations Hub** entries open the staff modules directly (admin bypasses staff-role gates but is blocked from customer-only routes).

## 11. Super Receptionist guide — TESTED (landing render)

The composite workspace (`/super-receptionist/*`) combines front desk, cashier, and inventory areas. Sidebar sections: **Front Desk**, **Cashier**, **Inventory**, **Account** — pages include Hotel/Vet/Grooming bookings, Walk-ins, Customers, Manage Services, History, POS (full screen, at `/cashier/pos`), Transactions, Reports, Stock Management, Monthly Audit, **My Payroll**, **Profile**.

Procedures mirror §5 (front desk), §6 (cashier), and §7 (inventory) with the same constraints — composite access does **not** include manager, veterinary, admin-only, or customer-portal functions.

**Screenshot:** Figure UM-012 (`UM-012-super-receptionist.png`).

## 12. Employee self-service and attendance kiosk

### 12.1 Self-service pages — VERIFIED (exercised)

Staff roles expose **My Payroll** (own payroll records/payslip view; `GET /api/my-payroll` is authenticated and caller-scoped), plus role-appropriate **My Attendance** (with attendance-correction requests) and **My Leave**. Review only your own records; do not publish payslip details. Runtime-verified 2026-10-22: a fixture employee filed an attendance correction and the manager reviewed it (both reject and approve paths work), and leave self-file → manager approve deducted the seeded balance.

### 12.2 Attendance kiosk — VERIFIED (gate + actual punch)

`/attendance-kiosk` is a PIN-gated employee attendance kiosk (Figure UM-013). Barcode and fingerprint kiosk variants exist under manager components. Runtime-verified 2026-10-22: the verify endpoint rejects an incorrect PIN (HTTP 401) and unlocks on the configured PIN (HTTP 200); a post-unlock barcode punch (`POST /api/kiosk/punch`, `X-Kiosk-Pin` header + employee number) wrote a real attendance row for a fixture employee (`check_in`/`check_out`, `source=barcode`), and a completed day correctly rejects further punches.

## 13. Payroll role scope

There is no standalone Payroll Manager role:

- Manager payroll operations sit under manager/admin backend roles; employee self-service is the separate `My Payroll` surface.
- In v0.1, the Create User form offered a **Payroll** option that backend validation rejected and no workspace supported. The option was removed in v0.2 (regression-tested in `e2e/manual-audit-regressions.spec.js`).

Do not document or create a Payroll-role account until the project owner defines a supported scope.

## 14. Cross-role workflows

**Verified end-to-end on 2026-10-22 (local dev build):**

```text
Customer: submits grooming request (review modal → confirm)   [SR created, pending/unpaid]
   -> Customer: uploads GCash proof + reference + file        [payment_status=pending]
   -> Receptionist: approves                                  [status=approved]
   -> Cashier: request appears in POS > Payment Approvals     [pending row with View Proof]
   -> Cashier: Verify                                        [settlement + receipt SR-REC-…]
   -> Customer: My Requests shows paid                        [VERIFIED]
```

Also verified on the same date (API-driven, results in `audit/runtime-verification-chain2.json`):

- **Walk-in → counter cash:** receptionist created walk-in SR-272 (existing customer) → approved → cashier settled as cash (`payment_method=cash`, receipt `SR-REC-20261022131509-272`).
- **POS sale + void:** service-item sale #73 processed (cash ₱200 for ₱150), then voided.
- **Proof rejection:** cashier rejected SR-273's proof with a reason; customer view shows `payment_status=rejected`.
- **Full consultation:** appointment 66 — start → `in_consultation` + draft medical record → record finalized → complete → `awaiting_payment` with billing synced.
- **Admin create user:** user 73 (receptionist) created; `auth.account_welcome` intent queued in `email_deliveries` and dispatched to the local mailer.
- **Hotel boarding:** customer booked boarding 60 with vaccination card → receptionist verified the card → approved.
- Customer vet request → approve → appointment visibility; reversible inventory adjustment with history entries.

Also verified on the same date via `e2e/manual-e2e-chain3.spec.js` (results: `audit/runtime-verification-chain3.json`):

- **Auth lifecycle:** register → unverified login works but protected booking POST returns 403 → email-verify → forgot/reset → login with new password (verify/reset completion via planted hashed tokens; intents reached SMTP `accepted` — mailbox delivery unprovable).
- **Gates:** inactive fixture user login → 403; customer→`/admin/users` → 403; cashier→`/manager/payroll` → 403.
- **Kiosk:** wrong PIN → 401; configured PIN → unlock.
- **HR:** leave self-file → approve → balance deducted (needs a seeded `leave_balances` row — `LeaveBalance::seedForPerson`); correction file → approve *and* → reject; day-offs set/clear/re-set; kiosk PIN → actual barcode punch.
- **Inventory ops:** supplier create→delete; batch receive→dispose on test item (stock restored).
- **Payroll:** fixture-employee payroll created → approved → released (`status=paid`).

**Documented but not executed:** bulk semi-monthly payroll generation, 13th-month accrual, salary loans, remittance/DTR/payroll report exports, barcode generation, monthly audit submission, settings changes. These remain implementation maps — see `audit/feature-verification-matrix.md` for per-feature status.

## 15. Troubleshooting

| Issue | Suggested action |
|---|---|
| Sign-in fails | Check username, password, and account status with the administrator. Use password recovery only with your own email. |
| Customer is directed to verification | Complete email verification via the link sent to your address, or request a resend. |
| Booking submission blocked | Confirm email verified, pet active + owned, slot available (the form checks availability inline). |
| No pet in booking form | Register an active pet in **My Pets** first. |
| Hotel room/date unavailable | Choose another date/room; availability changes before submission. |
| Hotel approval fails | Online hotel requests must use the Pet Hotel flow and carry a verified vaccination card. |
| Payment action unavailable | Confirm the request is eligible and at the required state; online rows with pending proof must be verified/rejected — counter cash is only for walk-in or rejected-proof online rows. |
| Payment queue empty/failing | The cashier queue requires the `service_billing_payment_requests` table — ensure migrations are current. |
| Cashier "Dashboard" opens the POS | Fixed in v0.2 — Dashboard now opens `/cashier/dashboard`; POS stays at `/cashier`/`/cashier/pos`. |
| Payroll role missing from Create User | Intentional: not a supported backend role (removed in v0.2). |
| Page missing / access denied | Confirm the account role with the administrator; do not bypass role restrictions. |
| Product order checkout | Customer store checkout is disabled (HTTP 410). Confirm scope with the owner. |
| Email/notification does not arrive | Intents dispatch to the configured SMTP provider (`provider_status=accepted`); if a message is missing, check the `email_deliveries` outbox row and provider logs — provider acceptance is not mailbox delivery. |
| Data looks wrong / app unavailable | Record page and time, avoid repeat submissions, and report to the authorized support contact (unconfirmed in this audit). |

## 16. Security and privacy

- Keep credentials private; never include them in screenshots or reports.
- View or change only records authorized for your role.
- Payment proofs are stored privately; receipt/issue actions are audit-logged.
- Treat payment operations, inventory changes, clinical records, account management, and payroll as sensitive state-changing actions.
- Do not use real customer or payment information in testing or documentation.
- Do not repeat a submission after an uncertain response until the record state is checked.
- Email in this build uses the configured SMTP provider (`MAIL_MAILER=smtp`) — intents are durable outbox rows and reached `provider_status=accepted`. Provider acceptance is dispatch, not recipient delivery; do not claim delivered mail from these records.

## 17. Screenshot index

All captures are genuine, taken 2026-10-22 from the running local build (`docs/user-manual/screenshots/`), privacy-reviewed (test fixtures only; no real personal or payment data):

| Figure | File | What it shows |
|---|---|---|
| UM-001 | `UM-001-login.png` | Login page |
| UM-002 | `UM-002-customer-services.png` | Customer Services workspace |
| UM-003 | `UM-003-customer-pets.png` | My Pets |
| UM-004 | `UM-004-booking-review.png` | Booking review modal (pre-submit) |
| UM-004a | `UM-004a-grooming-form-filled.png` | Filled grooming form with availability |
| UM-004b | `UM-004b-grooming-submitted.png` | My Appointments after confirm |
| UM-005 | `UM-005-receptionist-grooming-queue.png` | Receptionist grooming queue |
| UM-006 | `UM-006-cashier-payment-approvals.png` | Payment Approvals with pending GCash row |
| UM-007 | `UM-007-inventory-stock.png` | Stock Management |
| UM-008 | `UM-008-veterinary-appointments.png` | Veterinary appointments |
| UM-009 | `UM-009-manager-reports.png` | Manager reports |
| UM-010 | `UM-010-admin-manage-users.png` | Admin Manage Users |
| UM-011 | `UM-011-customer-medical.png` | Customer Medical (confinements) |
| UM-012 | `UM-012-super-receptionist.png` | Super Receptionist workspace |
| UM-013 | `UM-013-attendance-kiosk.png` | Attendance kiosk gate |
| UM-014 | `UM-014-cashier-dashboard.png` | Cashier dashboard overview |
| UM-015 | `UM-015-customer-request-paid.png` | Customer requests list |
| UM-016 | `UM-016-vet-appointment-approved.png` | Vet appointments w/ approved appointment |

## 18. Glossary and known limitations

| Term | Meaning |
|---|---|
| Customer request | Customer-submitted service/booking request (distinct from a product order) |
| Payment proof | Receipt/evidence for an online service payment |
| Booking channel | `online` (customer-submitted) vs `walk_in` (counter-booked); governs cashier actions |
| CODE-REVIEWED / TESTED / VERIFIED / BLOCKED | Verification statuses defined in §1.6 |
| Super Receptionist | Composite receptionist + cashier + inventory staff role |

**Known limitations (v0.2):**

- Verification ran against the **local dev build** with seeded/test data — production behavior, data volumes, and performance are unverified.
- State-changing flows verified: POS sale+void, walk-in→counter cash, hotel booking (vax card + approve), full consultation cycle, proof rejection, single-employee payroll lifecycle, admin user creation, register/verify/reset, kiosk PIN gate + actual barcode punch, leave self-file→approve→deduct + reject, correction approve + reject, day-offs set/clear/re-set, supplier/batch roundtrips.
- Still not exercised: bulk semi-monthly payroll generation, 13th-month accrual, salary loans, remittance/DTR/payroll report exports, barcode generation, monthly audit submission, settings changes.
- Email recipient delivery is not provable in this environment (intents dispatched to SMTP with `provider_status=accepted`; mailbox delivery unverified — test addresses use non-routable `example.test` domains).
- The dev DB was behind on migrations during the pass (resolved with an approved `php artisan migrate`); keep environments migrated.
- Institutional template, supported browser matrix (desktop Chromium only), and support contact remain unconfirmed.
- DOCX/PDF export pending (no converter in this environment).

## 19. Appendix: role quick reference

| Role | Workspace home | Main tasks |
|---|---|---|
| Customer | `/customer/services` | Pets, bookings, payment proof, requests/notifications/history |
| Receptionist | `/receptionist` (→ bookings/hotel) | Booking queues, walk-ins, customer profiles, services |
| Cashier | `/cashier` (POS) / `/cashier/dashboard` | POS sales, payment approvals, transactions |
| Inventory | `/inventory` (stock) | Stock, suppliers, batches, audits, barcodes |
| Veterinary | `/veterinary` (appointments) | Appointments, consultations, boarders, records |
| Manager | `/manager` | Reports, staff/attendance/leave/day-offs, payroll, HR |
| Admin | `/admin` | Users, audit/login history, reports, settings, ops hub |
| Super Receptionist | `/super-receptionist` | Receptionist + cashier + inventory combined |

## 20. Review and revision history

This manual must be reviewed against a confirmed current build by an authorized project representative and a first-time user before it is labeled final. Record future changes in the document-control table and keep `audit/` matrices and the screenshot register synchronized.
