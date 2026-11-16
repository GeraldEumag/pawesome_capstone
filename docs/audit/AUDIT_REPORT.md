# PAWESOME CAPSTONE B — CONSOLIDATED SYSTEM AUDIT REPORT

**Audit type:** Independent, read-only technical audit — system + manuscript alignment
**Manuscript audited:** `PAWESOME-PAPER-CHECKING-2.pdf` (156 pages)
**Repository:** `C:\xampp\htdocs\Pawesome_Capstone` (branch `main`, clean except untracked `docs/` artifacts)
**Audit date:** 2026-11 (this session)
**Rules honored:** no source modification, no fixes, no migrations/seeders, no DB writes outside the isolated `pawesome_test` suite, single new repository file (this report).

## Verification status vocabulary

| Status | Meaning |
|---|---|
| VERIFIED | Directly supported by inspected code or executed tests this session |
| PARTIALLY VERIFIED | Some evidence exists; complete behavior unconfirmed |
| NOT VERIFIED | Requires controlled execution or external confirmation |
| NOT IMPLEMENTED | Confirmed absent after inspecting relevant implementation |
| NOT APPLICABLE | Outside the approved system scope |

A missing page does not prove a missing backend; both layers were checked independently.

## Executed verification (this session)

- `php artisan route:list` — 727 effective routes inventoried with resolved middleware.
- `php artisan test` — **917 passed / 1 skipped / 4,157 assertions / 392s** on a connection positively confirmed as `pawesome_test` before execution (`tinker` echo + `phpunit.xml` env pins). `pawesome` was never touched.
- `npx vitest run` — **29/29 pass** (6 files).
- 88 Playwright E2E specs inventoried, **not executed** (requires dev servers; marked NOT VERIFIED where relevant).
- Manuscript: full text extraction + rendered figure pages (use case, DFDs, ERD, architecture) inspected as images.
- HTTP probe: `GET /Pawesome_Capstone/backend/.env` → **200** (see F-01).

---

# REPORT 1 — Executive System Audit Summary

## Overall condition

Pawesome is a **large, mature, mostly well-engineered** Laravel 12 + React 18 + MySQL application. It is far beyond a typical capstone scaffold: 727 routes, 83 controllers, 76 models, 98 migrated tables, a durable email outbox, FEFO batch inventory, bidirectional payment-sync services, a full HR/payroll suite, AI-assisted chatbot + receipt scanner, and a backend test suite that is **currently green end-to-end (917 tests)** on an isolated MySQL database.

The system's biggest risks are **not** inside the application logic — they are (1) the repository itself being web-served on the dev host (secrets + mutation scripts reachable via HTTP), (2) one deliberately disabled customer workflow (store orders → HTTP 410) that conflicts with the manuscript, and (3) manuscript-internal defects (Django/Python + Telegram leftovers, a 16-entity ERD missing inventory/payroll/POS) that will be asked about at defense.

## Major strengths (verified, not assumed)

- **Authentication hardening** — `ApiTokenAuth` accepts Bearer only (no query-param tokens), enforces expiry, and rejects deactivated users' tokens. Tested: `P1SecurityIntegrityTest` green.
- **Server-side financial authority** — POS ignores client-supplied prices/totals and re-resolves from `inventory_items.price`; hotel totals computed from `room.daily_rate`; service prices via `ServiceCatalog`. Tested: `pos ignores manipulated price and total` green.
- **Transactional integrity** — boarding approval wraps room-reservation + status promotion in `DB::transaction` with `lockForUpdate` + availability recheck; reject/cancel releases reservations; stock deduction is row-locked with FEFO batching and auditable `RECON-` self-heal batches.
- **RBAC** — `EnsureRole` middleware on essentially every group + `hasRoleAccess` parity + customer ownership scoping in controllers + `vet_tech` least-privilege contract.
- **Payment channel integrity** — `booking_channel` (online/walk_in) enforcement, duplicate-verification rejection, bidirectional service-request↔linked-record sync, dedup via `payment_references` unique constraint.
- **Email architecture** — durable `email_deliveries` outbox, queued `SendEmailDelivery`, scheduled dispatch+reconcile, encrypted recipients, preference suppression, dedup `occurrence_key`.
- **Test rigor** — 917/917 backend tests passing; coverage includes deactivated-token rejection, double-verification, atomic stock, idempotent check-ins, manager-gated waivers, cross-role notification matrix.

## Major weaknesses

- **F-01 (P0)** — `backend/.env` returns HTTP 200 via Apache; ~60 unauthenticated mutation scripts (`reset_passwords.php`, `get_token.php`, seeders, fixers) sit in the same web-reachable tree.
- **F-02 (P1)** — Customer store-order workflow deliberately disabled (HTTP 410) while manuscript describes customer orders + receptionist order-monitoring UI.
- **F-03 (P2)** — Public inventory endpoints (`/api/inventory/public/*`, `/sellable`) return `inventory_items.*` including `cost`/`supplier` columns.
- **F-04 (P2)** — Admin "security settings" (password length/complexity/max attempts) are stored and shown but read by **no code** — dead configuration advertised in the manuscript.
- **F-05 (P2)** — Dual-purpose schema pairs: `booking_requests` (dead), `vet_appointments`/`grooming_appointments`/`attendance_records`/`hotel_rooms` (legacy pools still read), six parallel payable constructs.
- Manuscript: stale Django/Python + Telegram text, methodology naming inconsistency, 16-entity ERD missing major modules, incomplete references.

## Critical risks for Capstone B

| Risk | Consequence if unaddressed |
|---|---|
| `.env` + scripts web-exposed | Secrets leaked; arbitrary password reset/token mint in demo environment — potentially a live-defense embarrassment or worse |
| Store orders 410 | Panel may test a documented feature that returns "disabled" |
| Dead password-policy settings | Demo of Fig-20 security settings shows config that does nothing |
| ERD vs 98-table reality | Documentation defense gap |

## General readiness assessment

**Needs improvement — approaching Ready with minor issues.** The engineering quality is genuinely high (suite-green, server-authoritative money paths, hardened auth), but the P0 exposure, the disabled order workflow, and manuscript inconsistencies are concrete blockers for a clean Capstone B evaluation. Nothing requires a redesign — every gap is bounded and fixable.

---

# REPORT 2 — Complete Module Audit

Legend: **Impl** = code exists; **Verified** = traced/tested this session.

## 1. Authentication & User Management — Impl+Verified

- `POST /api/auth/register|login|logout`, email verify/resend, forgot/reset (generic anti-enumeration responses), profile update (email change re-triggers verification for customers).
- Registration: bcrypt `Hash::make`, `min:8`, username/email unique, phone regex. **Gap:** configurable password policy unused (F-04).
- `verified` middleware gates customer booking POSTs; staff exempt per `AGENTS.md` contract.
- Sanctum PAT + `ApiTokenAuth` (bearer-only, expiry, `is_active` block — test-verified).
- Admin user creation → `AccountWelcomeMail` set-password link (no plaintext) — test-verified.

## 2. Customer & Pet Management — Impl+Verified

- `customer/pets` CRUD (role:customer) + shared `/pets` routes (receptionist/admin/manager/customer) with `ownsPet`/`currentCustomer` ownership scoping — traced.
- Archive/unarchive lifecycle, `archivedBy` audit, species-compatibility check on booking (`PetServiceCompatibilityService`).
- `pet_id` required on all booking producers; client-sent names ignored — server derives from `Pet` (test-verified `CustomerBookingRulesTest`).

## 3. Veterinary Services — Impl+Verified

- Full clinical chain: receptionist assigns specific vet → check-in (idempotent) → consultation start (draft record) → diagnostics orders → finalize (append-only, attributed addenda) → billing sync → cashier collects → auto-close when paid.
- Deep clinical scope: `medical_confinements`, `ward_beds`, MAR (medication administration records), progress notes, controlled-drug register, dispensations, recall dispatches, visit consents/estimates/invoices+adjustments.
- `vet_tech`: intake board only; cannot order diagnostics or reach clinical routes — test-verified.
- Cancel-after-consultation requires manager; waivers require manager approval — test-verified.

## 4. Grooming Services — Impl+Verified

- `groomings` model + grooming lifecycle (`BookingWorkflowStageTest` green: pending→approve→pay→ongoing→pickup).
- Grooming inventory consumption via `GroomingInventoryService`; approval deducts add-on stock once — test-verified.
- `grooming_appointments` legacy table still read by `BookingAvailabilityService` (F-05).

## 5. Pet Hotel / Boarding — Impl+Verified

- Public catalog (`/api/boarding/rooms*`, add-ons, availability) + booking via service request.
- Approval: atomic room reservation (`boarding_room_reservations`) + availability recheck + lock — VERIFIED.
- `boarding_care_logs`, check-in/out, add-ons with inventory deduction (`BoardingAddOnInventoryService`, `BoardingInventoryService`).
- **Dual room pools:** `hotel_rooms` (legacy single-unit, blocked via `boardings.hotel_room_id`) and `boarding_rooms` (capacity pool, blocked via reservations) — both live in `BookingAvailabilityService` (F-05).

## 6. Store Orders (customer) — **DISABLED** (F-02, P1)

- `CustomerStoreController::checkout` → 410 stub; reachable code below is dead.
- `ReceptionistCustomerOrderController::{pending,approve,reject,cancel}` → 410 stubs; `index`/`show` still list historical orders.
- `customer_orders`/`customer_order_items` tables remain; test asserts the disabled state.

## 7. POS & Payments — Impl+Verified

- `Cashier/POSController::checkout`: server-side pricing, VAT-inclusive math (`total × 0.12/1.12`), cash-received check, per-item `deductStock`, locked void path.
- `PaymentVerificationService`: cashier-only verify/reject, channel rules (online digital-proof vs walk_in cash), duplicate-verify rejected, `payment_references` unique(provider,reference) dedupe inside the verify transaction.
- Payment proofs: `private` disk, `FileStorageService::storeAndPersist` transactional, replaced proofs retained as evidence.
- Receipts: `PaymentReceiptMail` + all receipt endpoints carry `net_amount`/`vat_amount`/`vat_rate`.

## 8. Inventory & Supply Monitoring — Impl+Verified

- `inventory_items` + `inventory_batches` (FEFO) + `inventory_logs` + `inventory_monthly_audits`; `inventory:reconcile-stock [--apply]` command for drift.
- `deductStock`: `lockForUpdate`, expired-batch block, insufficient-stock block, `hasRealBatches` FEFO path, `RECON-` materialization for drift.
- Public catalog reads leak cost/supplier columns (F-03).
- Suppliers, barcode lookup (role-gated cashier/inventory/admin), monthly audits, expiry sweep scheduled daily.

## 9. Reports & Analytics — Impl+Verified

- `Admin/ReportsController` + per-role report controllers query real tables (`Sale`, etc.) — no hardcoded stats observed in inspected paths.
- Manager: workflow reports, remittance reports, receipt-scanner metrics; admin: activity logs, login logs, report alerts + history.
- `report_alerts`/`report_alert_history` scheduled alerting exists.

## 10. Notifications & Email — Impl+Verified

- `NotificationService` + role-scoped notifications; dedupe verified in `NotificationMatrixTest`.
- Email: `email_deliveries` outbox → `email-deliveries:dispatch` (every min) → `emails` queue → `SendEmailDelivery` → provider; reconcile every 10 min; encrypted recipients; send-time suppression.
- `PayslipReleasedMail` exists with **no producer** (F-08).

## 11. Chatbot & FAQ — Impl+Verified (static)

- Public + authenticated message endpoints; AI provider chain (Groq primary, Gemini fallback) with FAQ/rule/clarification fallback; conversation memory; grounded on live `services`/`hotel_rooms` + `config/store.php`.
- Chatbot can create bookings (`verified` + role-gated) — workflow bookings exist.
- `chatbot:eval` harness + `ChatbotReliabilityTest`/`ChatbotGroqTest` green.
- FAQ CRUD + conversation logs + stats for admin.

## 12. Live Chat — Impl+Verified

- Customer↔receptionist/admin sessions: start/claim/reply/close routed + role-gated. Manuscript checklist item 11 covered.

## 13. Payroll & HR — Impl+Verified

- `payrolls`, `attendance` (+corrections), `work_schedules`, `leave_*`, `salary_loans`, `holidays`, `thirteenth_month_accruals`, `employees`, `employee_day_offs`, `biometric_credentials` + PIN kiosk.
- `PayrollComputationService`; scheduled: absent-marking, 13th-month accrual (16th + last day), annual leave reset, probation checks.
- `My Payroll` self-service routes for staff (`Api/PayrollController`, `MyLeave`, `MyLoan`, `MyAttendanceCorrection`).
- `attendance_records` legacy parallel table still queried by `AttendanceRecordController` + admin reports (F-05).

## 14. Administration & Security — Impl+Verified (with dead-config gap)

- `activity_logs`, `login_logs` (+statistics/filters), `system_settings` grouped CRUD, landing-page content manager, chatbot FAQ/log admin.
- `SecurityHeaders`, `NormalizeApiResponse`, `IdempotencyKey`, `Cors` middleware.
- Dead security settings (F-04); login/session monitoring present.

## 15. Service Catalog & Availability — Impl+Verified

- `ServiceCatalog` single price-resolver used by all producers; `services` + `service_packages`(?) — service management admin/vet routes exist.
- Public availability endpoints (boarding/grooming/veterinary) + `BookingAvailabilityService` dual-pool room logic.

## 16. Receipt Scanner — Impl (NOT VERIFIED functionally)

- `Services/Receipts/` chain: Gemini vision → OpenRouter → local OCR (`pdftotext`/Tesseract), `payment_receipts`+`receipt_extractions`+`receipt_validations`, cashier confirm wraps `PaymentVerificationService::verify` + `payment_references` insert in one transaction.
- `ReceiptScannerTest` (12) green in suite; real-world accuracy NOT VERIFIED (`receipts:evaluate` harness exists, not run — AI calls would hit external APIs).

## 17. Kiosk Attendance — Impl+Verified

- `KioskPinAuth` middleware + `/api/kiosk/verify` + biometric credential model; `manager/barcode-attendance`, `fingerprint` controllers exist.

## Dead/orphaned code

- `TelegramBotController` + `TelegramService` — NOT routed anywhere (manuscript excluded Telegram — consistent, but dead code remains).
- `booking_requests` table — zero app references.
- `CashierPaymentVerification.jsx`, `ReceptionistBookings.jsx`, `ReceptionistAppointmentsBoarding.jsx`, `NewWalkInBookingModal` — unrouted legacy frontend files (documented in AGENTS).
- `adjustBatchStock` frontend helper → nonexistent endpoint (F-06, dead but harmless).

---

# REPORT 3 — Manuscript vs System Gap Analysis

## 3.1 Requirements traceability matrix

| Requirement | Manuscript ref | System evidence | Status | Gap | Priority |
|---|---|---|---|---|---|
| Online veterinary appointment scheduling | Obj. 1a; Fig 2,45,52; checklist | `appointments`, `vet_appointments`(legacy), SR→assign→consult→close chain; 25+ vet tests green | Implemented and verified | None material | — |
| Pet hotel reservation w/ availability & capacity | Obj. 1b; Fig 61,81; DFD7 | `boardings`, `boarding_rooms`(+`total_rooms`), `boarding_room_reservations`, availability endpoints, atomic approval | Implemented and verified | Dual room pools (legacy+modern) | P2 |
| Centralized DB: customers/pets/medical/services | Obj. 1c; ERD | `users`+`customers`+`pets`+`medical_records`+`services` (+60 related tables) | Implemented and verified | ERD figure omits most of them | P2 (doc) |
| Billing & payment processing | Obj. 1d; DFD9 | POS, `PaymentVerificationService`, settlements, receipts, VAT | Implemented and verified | Customer-side store orders disabled | P1 |
| Inventory & supply monitoring | Obj. 1e; DFD10 | items/batches(FEFO)/logs/audits/suppliers/expiry sweep | Implemented and verified | Cost+supplier exposed on public endpoints | P2 |
| Operational reports | Obj. 1f; Figs 22-26,54; checklist 15 | per-role report controllers on real tables; alerts | Implemented and verified | E2E verification pending | P3 |
| Secure accounts w/ RBAC | Obj. 1g; Fig 19-20 | ApiTokenAuth+EnsureRole+hasRoleAccess+ownership | Implemented and verified | Dead password-policy settings | P2 |
| Chatbot-driven FAQ + booking assist + notifications | Obj. 1h; Fig 31,56 | AiChatbotService (Groq/Gemini)+FAQ+workflow bookings+notify | Implemented and verified | Manuscript still says "Telegram chatbot" in places | P2 (doc) |
| Laravel + MySQL + RBAC tech | Obj. 2 | composer.json (laravel 12, sanctum), mysql | Implemented and verified | Manuscript also contains stale "Django/Python" text | P2 (doc) |
| Unit/integration/system testing | Obj. 3; Ch. testing; checklist | 917 backend tests green; 29 vitest; 88 e2e specs | Implemented and verified | E2E unexecuted this audit | P2 |
| ISO/IEC 25010 evaluation | Obj. 4; Tables 3-14 | manuscript claims 4.69 Excellent | Unable to verify | Survey evidence outside code | N/A |
| Payroll & staff schedules | Figs 28-30; checklist 14 | full payroll/attendance/leave/loan/13th-month suite | Implemented and verified | PayslipReleasedMail no producer | P3 |
| Live chat customer↔staff | Checklist 11; Fig 56 nav "Live Chat" | LiveChat sessions customer↔receptionist/admin | Implemented and verified | — | — |
| Receipt scanner | Checklist 9 | full reader chain + confirm txn + dedupe | Implemented but partially verified | AI accuracy unmeasured | P3 |
| Customer store orders ("View Orders", Fig 58) | Use case; Fig 58 | `checkout()`→410; receptionist mutations→410 | **Inconsistent with manuscript** | Workflow disabled deliberately | **P1** |
| Email verification / secure comms | Fig 74-75; checklist 13 | tokens, outbox, generic anti-enum responses | Implemented and verified | — | — |
| No payment gateway (limitation) | Scope limits | proof-upload + cashier verification model | Consistent | — | — |
| Attendance (manager: day-offs, ID cards) | Fig 80 nav | attendance suite + kiosk PIN + biometrics | Implemented and verified | Legacy `attendance_records` parallel | P2 |

## 3.2 Manuscript-internal defects (documentation findings)

| ID | Defect | Location | Severity |
|---|---|---|---|
| D-01 | Sprint Execution says "Django for server-side development, Python for application logic" — contradicts Laravel/React everywhere else incl. the manuscript's own later chapter | PDF ~p88 | P2 |
| D-02 | ~10 references to "Telegram chatbot" (sprint planning/backlog/review/DoD/data-analysis) vs IPO section's explicit exclusion and the actual in-app chatbot | p88-93 | P2 |
| D-03 | Methodology named "Agile Incremental Model", "Agile Scrum Model 2025", and "Agile Scrum methodology" interchangeably | p11, p88, p109 | P3 |
| D-04 | "Purposive sampling" (Data Analysis Plan) vs "Random sampling" (Sampling Technique) | p93 vs p96 | P3 |
| D-05 | ERD (Fig 16) has 16 entities; omits inventory, grooming, boarding rooms, sales/POS, payroll/attendance, live chat, email, gift cards — all in manuscript scope | p40 | P2 |
| D-06 | Architecture text lists 11 modules ("Records and Database Management", "Web-Based Access") while Fig 71 shows 10 differently-decomposed modules (Vet/Grooming/Hotel/POS split) | p83-85 | P3 |
| D-07 | Incomplete references: "[Complete title, publisher, and link]", "[Title of document]. [URL]" ×2 | References | P3 |
| D-08 | Role naming: narrative mentions "veterinary assistants"/"hotel attendants"; use-case defines 7 roles; system also has `vet_tech` + `super_receptionist` | multiple | P3 |

## 3.3 Diagrams verified against implementation

- **Fig 71 architecture** — matches the system conceptually (3-tier, 7 roles, Internet→app→MySQL). The reconstructed `docs/diagrams/Pawesome_System_Architecture.drawio` preserves this content.
- **Fig 2 use case** — 7 actors; role/capability mapping largely consistent with `EnsureRole` groups, except customer "View Orders" (disabled workflow).
- **Fig 16 ERD** — as noted (D-05), heavily simplified vs the 98-table schema.
- **DFDs L2** — processes exist in code (registration, pets, booking, vet consult, payment, inventory, reporting); DFD data stores are idealized names, not table names.

---

# REPORT 4 — Database & Architecture Audit

## 4.1 Schema inventory

- **98 tables** created by 183 migrations; `users`, `service_requests`, `inventory_items`, `appointments`, `boardings`, `payrolls`, `sales` each touched by 15–30 migrations (heavy evolution).
- Idempotency support: `idempotency_keys` table + middleware + daily prune.
- Queue/outbox support: `jobs`, `job_batches`, `failed_jobs`, `cache`, `sessions` (database drivers available).
- Framework tables present: `personal_access_tokens`, `password_reset_tokens`, `email_verification_tokens` (hashed, 60-min expiry).

## 4.2 Relationship assessment

Verified healthy: `pets.customer_id`→customers, `customers.user_id`→users, SR↔appointments/groomings/boardings via `service_request_id`/`linked_*`, `boarding_room_reservations`→boarding_rooms, `inventory_batches`→inventory_items, `sale_items`→sales, `payment_settlement_items`→payment_settlements, `employees.user_id`→users.

## 4.3 Duplicate-purpose structures (design debt, F-05)

| Pair | State | Risk |
|---|---|---|
| `booking_requests` vs `service_requests` | booking_requests: **zero app references** — dead | dead schema confusion |
| `vet_appointments` vs `appointments` | vet_appointments read only by Admin/ReportsController legacy path | report divergence risk |
| `grooming_appointments` vs `groomings` | legacy still read by BookingAvailabilityService | availability logic maintains two pools |
| `attendance_records` vs `attendance`(+corrections) | thin legacy table, AttendanceRecordController + reports | parallel attendance truth |
| `hotel_rooms` vs `boarding_rooms` | **both live**: legacy single-unit vs capacity pool, different blocking semantics | room availability dual source of truth |
| `customers` vs `users` | customer profile vs account — intentional split, consistently joined | acceptable |
| `payments`/`payment_settlements`/`service_billing_payment_requests`/`sales`/`invoices`/`visit_invoices` | six payable constructs, each functional | consolidation complexity; report queries must pick canonical sources |

## 4.4 Architecture assessment

- **Layering is sound**: controllers → services (PaymentVerificationService, InventoryService, ServiceBillingService, BookingAvailabilityService, PayrollComputationService, receipt/chatbot chains) → models; business logic mostly out of controllers.
- **API surface discipline**: `role:` groups by prefix; public surface is 33 routes and mostly intentional.
- **Response normalization**: `NormalizeApiResponse` + `Support/ApiResponse` — consistent envelope.
- **Weaknesses**: legacy tables left live (F-05), dead scripts in repo root (F-01), dead frontend files/helpers, six payable constructs.

## 4.5 N+1 / performance (static review)

- `lockForUpdate` used correctly on mutation paths; `with()` eager loading observed (pets `.with(['customer','archivedBy'])`); `Schema::hasTable/hasColumn` guards used for legacy compatibility (adds query overhead but keeps dual-schema safe).
- No measurements taken — **performance is NOT VERIFIED** (recommend: query counts on dashboard endpoints, `inventory_items.*` public payload size, unindexed FK scan on high-traffic tables).

---

# REPORT 5 — Security Audit

## Findings

### F-01 — P0 — VERIFIED: Repository web-served; secrets + mutation scripts exposed

- `GET http://localhost/Pawesome_Capstone/backend/.env` → **HTTP 200**. On the dev/demo host, Apache serves the repo tree directly: `.env` (APP_KEY, DB credentials, `BREVO_API_KEY`, `CHATBOT_GROQ_API_KEY`, etc.) is browser-readable.
- Same tree contains ~60 root-level PHP scripts that bootstrap the app with full DB access and **no authentication**: `reset_passwords.php` (staff→`password123`), `get_token.php` (common-password probe + mints Sanctum token), `seed_attendance.php`, `generate_e2e_payroll.php`, `create_test_items.php`, `fix_boarding_mismatch.php`, `standardize_item_type_naming.php`, plus `check_*/test_*/debug_*` files.
- Execution of a `.php` script was **not tested** (it would mutate); directory mapping is verified, so web-execution likelihood is high (PARTIALLY VERIFIED).
- **Impact:** full credential disclosure + unauthenticated data mutation on any host serving the repo root. On a defense/demo machine this is a showstopper.
- **Fix direction (not applied):** move utility scripts under a non-web path or delete; ensure only `backend/public/` is ever web-rooted; rotate keys if any non-localhost exposure occurred; add `.htaccess` deny or Apache `DocumentRoot` discipline; remove scripts from the deployed artifact.

### F-03 — P2 — VERIFIED: Public inventory endpoints leak cost/supplier

- `api.php:992-998` — `throttle:api` only; `InventoryService::getPublicItems` selects `inventory_items.*`; `showPublicItem` returns the full model.
- **Impact:** anonymous callers read `cost`, `supplier`, `supplier_id`, `reorder_level` — procurement-sensitive data.
- **Fix direction:** column whitelist or API resource; keep `price`/`stock_status`/image only.

### F-04 — P2 — VERIFIED: Dead security configuration

- `security_*` settings exist (admin UI editable) but nothing reads them; registration uses static `min:8`; `throttle:auth` hard-codes 5/min.
- **Impact:** manuscript-advertised controls inert; demo question "does the max-attempts setting work?" → no.
- **Fix direction:** either enforce settings in `AuthController`/rate limiter, or remove the settings panel claims.

### F-08 — P3 — VERIFIED: `PayslipReleasedMail` has no producer

- Mailable defined; zero call sites. Payroll emails never sent.

### F-09 — P3 — VERIFIED: Enumerable public profile photos

- `GET /api/files/profile-photos/{userId}/view` unauthenticated; sequential IDs allow enumeration of staff/customer photos (mostly initials avatars — low impact).

### F-06 — P3 — VERIFIED: Dead frontend helper hitting nonexistent route

- `src/api/inventory.jsx:682` `adjustBatchStock` → `POST /inventory/batches/{id}/adjust` (no such route; live route is `PUT /inventory/batches/{id}`). Uncalled — dead code only.

## Controls verified PASS

| Control | Evidence |
|---|---|
| Deactivated-user token rejection | `ApiTokenAuth` + test |
| Bearer-only tokens | `ApiTokenAuth` (no query params) |
| Token expiry | expires_at + sanctum.expiration checks |
| Customer IDOR on pets | `ownsPet`/`currentCustomer` scoping; tests (`foreign-pet 403`) |
| Customer self-verify payment | verify routes inside `role:cashier` group |
| Client price/total trust | ignored server-side (POS, SR, boarding) |
| Double-verify / double-deduction | duplicate rejected; `payment_references` unique; locked void |
| Rate limiting | per-token API bucket, dual auth buckets (IP + account|IP, 5/min), chatbot min+day caps, kiosk throttle |
| File uploads | MIME whitelist (jpg/png/webp/pdf), transactional storage, private proofs |
| Mass assignment | `$fillable` on models (no `guarded=[]` observed in inspected models) |
| XSS surface | zero `dangerouslySetInnerHTML` in `src/` |
| Anti-enumeration | generic verify/reset/resend responses |
| Audit logging | `activity_logs` + `login_logs` + `ActivityLog::log` on sensitive ops |

## Security posture summary

Application-layer security is **strong and test-backed**. The critical exposure is **environmental/depository hygiene** (F-01) plus two information-disclosure items (F-03, F-09) and dead advertised controls (F-04). Dynamic exploit testing (IDOR probes against a live API) was not performed — marked for controlled testing in the roadmap.

---

# REPORT 6 — Workflow & Integration Audit

Verification levels: **T** = test-verified this suite run · **C** = code-traced this audit · **N** = not verified.

| # | Workflow | Evidence | Verdict |
|---|---|---|---|
| 1 | Register→verify→login→RBAC | Registration txn, hashed tokens, `verified` gate on bookings, generic responses; EmailAuthFlowTest | **Working (T/C)** |
| 2 | Pet CRUD + ownership | `pet_id` required on bookings, owner/foreign-pet tests | **Working (T/C)** |
| 3 | Vet appointment: request→assign→consult→records→bill→pay→close | full chain; `VeterinaryWorkflowTest` incl. cross-vet audit logging, auto-close on cashier payment | **Working (T/C)** |
| 4 | Grooming request→approve→service→inventory→pay | BookingWorkflowStageTest; add-on stock deduction once | **Working (T/C)** |
| 5 | Boarding: availability→request→approve(room txn)→check-in→care→checkout→pay | atomic reservation + release on reject; P1SecurityIntegrityTest hotel cases | **Working (T/C)** |
| 6 | Customer store orders→approval→stock→payment→receipt | **checkout()→410; receptionist mutations→410** | **DISABLED (C)** — manuscript inconsistency |
| 7 | Cashier POS: products→cart→server prices→deduct→receipt | server-authoritative totals, FEFO deduction, receipt + VAT | **Working (T/C)** |
| 8 | Payment verification: proof→cashier verify/reject→settlement→receipt email | channel rules, dedupe, shared receipts, bidirectional sync | **Working (T/C)** |
| 9 | Inventory: receive→adjust→deduct→restore→logs→audits→expiry | lockForUpdate, RECON batches, reconcile command, daily sweep | **Working (T/C)** |
| 10 | Notifications & email: intent→outbox→dispatch→provider | outbox+queue+scheduler; NotificationMatrixTest dedupe/roles | **Working (T/C)** — provider delivery on Brevo NOT VERIFIED this session |
| 11 | Reports from real tables | Sale/aggregation queries inspected | **Working (C)** — browser verification pending |
| 12 | Admin/audit: users, roles, activity, login logs, settings | controllers + logs present | **Working (C)** — settings enforcement gap F-04 |
| + | Live chat customer↔staff | routed + role-gated | **Working (C)** |
| + | Payroll: attendance→compute→13th-month→loans→leave | services + schedulers + models | **Working (C)** — payslip email producer missing (F-08) |
| + | Chatbot booking assist | workflow endpoints + verified gate | **Working (C)** — AI accuracy NOT VERIFIED |

**Integration verdict:** the system behaves as **one integrated application** — cross-role notifications, shared receipts, linked-record payment sync, inventory coupling on boarding add-ons/POS, billing gates on visit closure. The single broken integration is the deliberately disabled customer-order channel.

---

# REPORT 7 — QA & Testing Report

## Executed this audit

| Suite | Result | Scope |
|---|---|---|
| `php artisan test` on `pawesome_test` | **917 pass / 1 skip / 4,157 assertions / 392s — GREEN** | 121 test files, Unit + Feature |
| `npx vitest run` | **29/29 pass** | 6 frontend test files |
| `php artisan route:list` | 727 routes inventoried | full API surface |

## Coverage inventory

- **Backend tests:** auth/security (P1SecurityIntegrityTest), email auth flow, storage lifecycle, payment booking channel, cashier queue dedupe, inventory reconciliation, service billing, veterinary workflow (25+ cases incl. idempotency + audit logging), notification matrix, customer booking rules, POS, payroll/attendance/leave, chatbot, receipt scanner, medical records.
- **Frontend unit tests:** 6 files — thin (utils + client). Missing: component tests for forms/tables/modals, hook tests, auth-context tests.
- **E2E:** 88 Playwright specs covering every role + cross-role + responsive + storage-hardening + route-authorization-matrix. Prior recorded run: 105 pass/13 fail (Windows resource starvation) — **not re-executed** (needs dev servers; AGENTS notes known Windows socket exhaustion).

## Testing gaps

1. E2E re-execution on a stable environment (Docker/Linux or `--workers=2`) — manuscript claims browser-level verification; current evidence is historical.
2. Frontend component coverage is minimal vs 298 source files.
3. Load/performance testing absent (no measurements anywhere).
4. AI accuracy: `chatbot:eval` (11 cases) and `receipts:evaluate` harnesses exist but unrun (external API calls).
5. Production-environment smoke (Railway API + Vercel FE) unverified.

## Proposed high-value test additions (for roadmap)

- Live API IDOR probes (cross-customer record access, cross-role endpoint calls) — dynamic complement to static verification.
- Concurrency test for boarding room double-booking under parallel approvals (a `security-concurrency-audit` spec exists — run it).
- Store-order workflow tests **if re-enabled**; otherwise a test asserting the disabled contract + manuscript update.

---

# REPORT 8 — Prioritized Master Action Plan

Ordering follows **verified dependencies**, not severity alone. Nothing below is implemented in this audit.

## PHASE 0 — Safety & Baseline (before anything else)

| Task ID | Task | Reason | Severity | Dependencies | Effort | Acceptance |
|---|---|---|---|---|---|---|
| T-001 | Pull `backend/.env` + non-`public/` files out of the web-served path (htaccess deny or restructure docroot) | F-01: secrets currently downloadable | P0 | none | S | `GET /backend/.env` → 403/404; `GET /backend/*.php` non-executable |
| T-002 | Move/delete root-level mutation scripts (`reset_passwords`, `get_token`, `seed_*`, `fix_*`, `create_test_*`, `check_*`, `debug_*`, `test_*`, `tmp_*`) — archive outside repo or into a `tools/` dir excluded from deployment | F-01: unauthenticated full-DB mutation utilities | P0 | T-001 | S | scripts absent from web path; repo retains only audit scripts referenced in AGENTS |
| T-003 | Decide whether any non-localhost exposure occurred; if yes rotate APP_KEY + Brevo/Groq keys | containment | P0 | T-001 | S | documented decision |
| T-004 | Baseline snapshot: git tag + `php artisan test` rerun post-changes | regression gate | — | all | S | suite stays 917 green |

## PHASE 1 — Security & data integrity

| Task ID | Task | Reason | Severity | Dependencies | Effort | Acceptance |
|---|---|---|---|---|---|---|
| T-010 | Whitelist public inventory payload columns (name, sku, price, stock_status, photo, category) in `getPublicItems`/`showPublicItem`/`sellable` | F-03 | P2→P1-adjacent | T-004 | S | response JSON lacks cost/supplier fields; store/POS catalog still works |
| T-011 | Enforce or remove `security_*` settings: wire into registration/change-password validation + auth throttle | F-04 | P2 | none | M | changing `security_min_password_length` affects validation; max-attempts honored |
| T-012 | Restrict profile-photo endpoint (auth + owner-or-staff, or signed URLs) | F-09 | P3 | none | S | anonymous fetch denied; avatars still render (data-URI fallback covers) |
| T-013 | Remove dead `adjustBatchStock` helper or point at `PUT` route | F-06 | P3 | none | XS | helper consistent |

## PHASE 2 — Scope decision & manuscript alignment

| Task ID | Task | Reason | Severity | Dependencies | Effort | Acceptance |
|---|---|---|---|---|---|---|
| T-020 | **Decision gate: customer store orders.** Re-enable (checkout + receptionist approval chain) OR document as descoped + update manuscript use-case/Fig 58 + remove 410 stubs cleanly | F-02 | P1 | none (decision) | S (decision) / L (re-enable) | recorded decision; either working E2E order flow w/ tests or manuscript + code aligned on removal |
| T-021 | Fix manuscript stale text: Django/Python→Laravel/React; Telegram→in-app chatbot; methodology naming; sampling naming | D-01..04 | P2 | T-020 (terminology consistency) | S | manuscript internally consistent |
| T-022 | Regenerate ERD to reflect real schema (or annotate simplified ERD as conceptual); reconcile 11-vs-10 module lists | D-05/06 | P2 | none | M | ERD includes inventory/payroll/POS/boarding entities; module narrative matches Fig 71 |
| T-023 | Complete/annotate incomplete references | D-07 | P3 | none | XS | no placeholder citations |
| T-024 | Wire `PayslipReleasedMail` producer or remove the mailable | F-08 | P3 | none | S | payslip release emails or dead code removed |

## PHASE 3 — Schema-debt cleanup (post-decision)

| Task ID | Task | Reason | Severity | Dependencies | Effort | Acceptance |
|---|---|---|---|---|---|---|
| T-030 | Retire `booking_requests` (dead), `vet_appointments`, `grooming_appointments`, `attendance_records` — archive data, drop or mark deprecated | F-05 | P2 | data audit per table | M | no code references; migration reversible |
| T-031 | Consolidate `hotel_rooms`→`boarding_rooms` (single availability truth) or formally document dual-pool contract | F-05 | P2 | data reconciliation | M–L | one blocking path per room type; availability tests updated |
| T-032 | Document payable-construct map (payments vs settlements vs billing requests vs sales vs invoices vs visit_invoices) | F-05 | P2 | none | S | `docs/` map; reports use canonical source per flow |

## PHASE 4 — Verification hardening

| Task ID | Task | Reason | Severity | Dependencies | Effort | Acceptance |
|---|---|---|---|---|---|---|
| T-040 | Run 88-spec E2E suite at `--workers=2` (or Linux/Docker) post-changes | final regression | — | all above | M | recorded pass/fail; failures triaged to Windows-resource vs real |
| T-041 | Dynamic IDOR/RBAC probes on live local API (cross-customer, cross-role, token reuse) | confirm static findings | P1-verification | T-001 | M | probe report; any new findings appended |
| T-042 | `chatbot:eval` + `receipts:evaluate` accuracy runs (requires API keys — user approval) | functional verification | — | env keys | S | accuracy report |
| T-043 | Broaden frontend unit tests for high-risk forms (payment upload, booking modals) | coverage | P3 | none | M | coverage report |

## PHASE 5 — Deployment & defense prep

| Task ID | Task | Reason | Severity | Dependencies | Effort | Acceptance |
|---|---|---|---|---|---|---|
| T-050 | Deployment verification: Railway env (APP_DEBUG=false, HTTPS, exact CORS/Sanctum domains, persistent storage, queue worker/scheduler, backups) | prod readiness | P2 | T-001..003 | M | checklist pass per AGENTS release list |
| T-051 | Defense demo script: which features to show (avoid dead settings, disabled orders unless re-enabled), evidence pack (test counts, this audit, ERD, architecture .drawio) | capstone readiness | — | all | S | demo runbook |

**Dependency chain summary:** F-01 containment → public-surface fixes → scope decision (orders) → manuscript edits aligned to that decision → schema-debt cleanup → E2E verification → deployment + demo prep.

---

# REPORT 9 — Independent QA Review

The QA reviewer re-challenged every finding:

| Finding | Challenge result | Adjusted |
|---|---|---|
| F-01 (.env 200 + scripts) | VERIFIED for exposure (probe confirmed). Web-execution of `.php` scripts: PARTIALLY VERIFIED — kept P0 because directory mapping is proven and the scripts carry full-app bootstrap; execution was deliberately not triggered (mutation). Recommendation stands; added "rotate keys if non-localhost exposure" task. | kept P0 |
| F-02 (orders 410) | Verified in code + routes + test that asserts disabled state. Severity debated: it's intentional, not a bug — but it IS a manuscript-alignment P1 because the manuscript documents the feature (Fig 58 receptionist orders UI; customer "View Orders" use case). Kept as P1 **manuscript-inconsistency**, framed as a decision gate, not a defect. | kept P1 (reframed) |
| F-03 (public cost leak) | Confirmed `select('*')` + full model return. Debated P1 vs P2: business-sensitive but not PII/credentials; catalog legitimately needs public reads. **Kept P2** with P1-adjacent note. | kept P2 |
| F-04 (dead security settings) | Verified zero read-sites. Downgraded severity justification: settings panel is an admin convenience; inert ≠ vulnerability. **Kept P2** because manuscript advertises it as functional control. | kept P2 |
| F-05 (dual schema) | `hotel_rooms`/`boarding_rooms` confirmed both live — this is managed dual-pool design, not an accident; reframed as documented-debt requiring either consolidation or a written contract. `booking_requests` confirmed fully dead. | kept P2 |
| F-08/F-09/F-06 | Verified; minor. Kept P3. | kept |
| Suite result | 917-pass claim now **VERIFIED** (this run); AGENTS' older "570 tests" figure is stale — suite grew. | verified |
| Assumption check | "Payroll Manager" as a separate role — rejected: payroll is admin/manager function per manuscript Figs 28-30; no separate role required. "vet_tech"/"super_receptionist" exist beyond manuscript's 7 — flagged as doc note, not a defect. | — |
| Missed-module check | Gift cards, suppliers, landing-page CMS, report alerts, controlled-drug register, confinement wards, diagnostic orders, ID cards, holidays — all inventoried; no additional defects found in spot checks. | — |
| Roadmap sanity | Dependencies hold: containment before public-surface work; orders decision gates manuscript edits; cleanup after decision; E2E last. No recommendation risks regressions (all have acceptance tests). | — |
| Removed | Draft finding "PostgreSQL/sqlite driver branches in ReportsController" — reviewed: `sqlite` branches are legacy test fallbacks, harmless; removed. | removed |

**QA verdict:** findings F-01..F-09 stand with stated severities; no unsupported claims retained; audit honestly marks unexecuted surfaces (E2E, AI accuracy, live provider delivery, production deployment) as NOT VERIFIED rather than working.

---

# REPORT 10 — Final Capstone B Readiness Assessment

| Area | Status | Basis |
|---|---|---|
| Functional completeness | **Needs improvement** | all major modules work except disabled customer store orders (F-02) |
| Manuscript alignment | **Needs improvement** | F-02 + D-01..D-08 manuscript defects + ERD gap |
| Backend quality | **Ready with minor issues** | green suite, transactional money paths, clean layering; legacy-table debt |
| Frontend quality | **Ready with minor issues** | coherent design system + role portals; thin unit coverage; some dead components |
| Database integrity | **Ready with minor issues** | strong mutation safety; dual-purpose table debt (F-05) |
| Security | **Needs improvement** | strong app-layer controls; P0 environmental exposure (F-01) + P2 leaks |
| Role-based access | **Ready** | middleware + ownership + composite roles + vet_tech, all test-verified |
| Module integration | **Ready with minor issues** | cross-role notifications/billing/inventory integrated; orders channel off |
| Testing | **Ready with minor issues** | 917-test green suite; E2E + frontend coverage gaps |
| UI/UX | **Not verified** | systematic browser pass not executed (structure/design-system verified statically) |
| Deployment readiness | **Not verified** | local dev only this session; Railway/Vercel posture unchecked |
| Documentation readiness | **Needs improvement** | extensive internal docs exist; manuscript needs defect cleanup |

## Overall

**Needs improvement — with a clear, bounded path to Ready.**

The three gate items before a confident Capstone B evaluation:

1. **F-01 containment** (P0): un-serve the repo; quarantine scripts; decide on key rotation.
2. **F-02 decision** (P1): re-enable customer store orders **or** align the manuscript to the descoped reality.
3. **Manuscript cleanup** (P2): Django/Telegram/methodology/ERD fixes so the defense narrative matches the real system.

Everything else (dead settings, schema debt, minor leaks, coverage gaps, payslip mail) is bounded P2/P3 work with clear acceptance criteria. The underlying system is genuinely strong — **917 passing backend tests, server-authoritative financial logic, transactional booking safety, hardened token auth, and a durable email outbox** — and requires **no architectural redesign** to reach readiness.

## Uninspected / unverified surfaces (explicit)

- Live browser flows (all 88 E2E specs) — pending controlled run.
- AI provider paths (Groq/Gemini live calls; receipt-scanner accuracy on real receipts).
- Brevo provider delivery in production (verified previously per AGENTS, not re-verified).
- Real `pawesome` data quality (production DB untouched — read-only scope honored).
- Railway/Vercel live deployment state, backups, queue workers.
- Performance/load characteristics (no measurements taken or claimed).
- Whether `.php` scripts execute when hit over HTTP (deliberately untested to avoid mutation).
- Deep content of every controller (~83) — high-risk controllers traced; remaining were inventory-scanned, not line-reviewed.
- Frontend component internals beyond API layer/routing/auth (UI/UX visual pass not done).
