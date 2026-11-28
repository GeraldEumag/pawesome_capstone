# 14 — Manual / Exploratory Verification

Beyond the automated suites, the following paths were exercised directly
during the audit (evidence trails in each section's report):

## Species / service compatibility (SYS-01)

- Verified enforcement on **every** booking channel before and after the
  fix: receptionist appointment (`AppointmentController::store`),
  customer portal (`PortalController::bookAppointment`), AI chatbot
  booking (`ChatbotWorkflowController::createBooking`), walk-in
  (`WalkInBookingController` + `BoardingController::store`), grooming
  (`GroomingController::store`, `Api\GroomingController::store`),
  receptionist service requests (`ReceptionistRequestController::store`),
  and room reservations (`createRoomReservation` → `allowed_species`).
- Rejection produces a 422 with a clear message; hotel rooms additionally
  enforce `allowed_species` at reservation time.

## POS / VAT / receipts

- `ReceiptBreakdown` is VAT-inclusive end-to-end: backend `POSController`,
  cashier dashboard, service-request payment, customer store checkout,
  and receipt email all now read `ReceiptBreakdown::VAT_RATE` (12%)
  instead of scattered literals.
- `Sale::calculateTotals()` (dead code) aligned to the same convention
  so a future caller can't silently reintroduce exclusive math.
- Receipt chain verified: cashier-confirm only, unique reference
  constraint, blocking validations, correction tracking.

## Inventory

- Stock movements, batch expiry, UOM packaging, auto-barcode,
  concurrency — verified via reports 02–04 and the batch5 E2E route
  sweep; `php artisan inventory:reconcile-stock` available for drift.

## PDF / logo

- `PayslipPdfService` (Dompdf) embeds `pawesome.jpg` as a data URI —
  verified rendering path in report 07; receipts remain HTML/print
  (documented, not a defect).

## API / DB / RBAC

- 18 public API routes audited — all throttled; Brevo webhook uses
  shared-secret auth; kiosk uses PIN. Role middleware matches the
  documented RBAC matrix (report 11).
- Foreign keys, constraints, and transaction boundaries reviewed
  (report 09); DB integrity suite (`DatabaseIntegrityTest`) green.

## AI receipt reading

- `app/Services/Receipts/` chain (Gemini/OpenRouter vision + local OCR
  fallback) audited in report 06; confirmation remains cashier-gated —
  OCR output never auto-posts to inventory.

## Frontend receipt display

- `frontend/src/api/pos.js` `generateReceipt` was updated during the fix
  pass: the displayed VAT is now extracted from the VAT-inclusive gross
  (`subtotal * 0.12 / 1.12`) instead of added on top, matching the
  backend `ReceiptBreakdown` convention. Display-only path; backend
  totals remain authoritative.
