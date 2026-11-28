# 08 — API & Backend Audit

## Route surface

- 743 API routes enumerated via `php artisan route:list --json`.
- **Mutating routes without auth/role middleware: exactly 3**, all
  intentionally public and guarded by alternative controls:
  - `POST api/chatbot/public/message` — `throttle:chatbot-public`
  - `POST api/kiosk/verify` — `throttle:10,1` + kiosk-PIN/staff-token
    flow (`kiosk.pin` middleware on subsequent kiosk routes)
  - `POST api/webhooks/brevo` — `throttle:60,1` + shared-secret header
- Read-only public routes (18 total incl. the 3 above): boarding room
  catalog, public chatbot welcome, holidays/blocked, public inventory
  browse, sellable items, landing page, `settings/public`,
  `inventory/public/*` — all throttled; `PublicInventoryExposureTest`
  verifies no sensitive fields leak.

## Middleware chain

- `auth.api` (Sanctum token) → `throttle:api` → `role:*`/`EnsureRole` on
  staff modules; `verified` (EnsureEmailIsVerified) on customer booking/
  checkout POSTs; staff exempt. Role normalization (admin bypass,
  super_receptionist expansion, vet/super_admin→admin) verified in
  `EnsureRole` — matches documented RBAC in AGENTS.md.
- Ownership checks: customer-scoped endpoints resolve the customer from
  the authenticated user (`currentCustomer`/`currentCustomerId`), never
  trust client `customer_id` for customers; staff paths use explicit
  role gates.

## Validation & mass-assignment

- Controllers use `Validator::make`/`$request->validate` with explicit
  field lists; models' `$fillable`/`$guarded` reviewed on touched paths —
  no mass-assignment of privileged fields (role, payment_status,
  stock) observed; payment/stock state transitions go through service
  classes, not request input.
- Server-authoritative values: POS prices, VAT, stock, receipt totals —
  client values ignored or overwritten (verified POSController,
  ReceiptBreakdown, PaymentVerificationService).

## Response consistency

- Errors consistently `{'success':false,'message','errors'}` or
  `{'message'}` 4xx; success payloads wrap domain data. Minor
  inconsistency: some endpoints return bare `errors` 422 without
  `success:false` — cosmetic, documented as known issue (P3).

## Dead/duplicate endpoints

- `generateReceipt` in `frontend/src/api/pos.js` is dead code (no
  callers) — fixed VAT math anyway; flagged for future removal.
- Legacy parallel paths exist by design (e.g., `/api/groomings` vs
  `/api/receptionist/groomings`, `hotel_room_id` vs `room_id` boarding)
  — all now enforce the same species/availability rules after this
  audit's fixes.

## Verdict

**PASS** — auth coverage is complete; the only unauthenticated mutations
are deliberate, throttled, and alternatively authenticated.
