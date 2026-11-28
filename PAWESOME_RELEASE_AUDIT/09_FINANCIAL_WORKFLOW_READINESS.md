# 09 — Financial Workflow Release Check

## POS checkout (`Cashier\POSController::processTransaction`) — verified line-by-line

| Requirement | Evidence | Status |
| --- | --- | --- |
| Backend calculations authoritative | Comment + code: "Client-supplied unit_price/subtotal/tax/discount/total are ignored for persistence" — only item IDs + quantities are inputs | PASS |
| Prices from trusted DB records | `InventoryItem`/`Service` fetched server-side; products must be `status=active`, `is_sellable`, non-archived | PASS |
| Stock consistency | `lockForUpdate()` on items + explicit insufficient-stock rejection inside `DB::transaction` | PASS |
| VAT-inclusive convention | `ReceiptBreakdown::VAT_RATE` everywhere (fixed in prior audit); `Sale::calculateTotals` aligned | PASS |
| Client discounts | **Deliberately not honored** — no server-side discount engine; `$lineDiscount = 0.0`. Prevents arbitrary price reduction while stock deducts | PASS (by design) |
| Payment methods | Validated enum: cash/credit_card/debit_card/gcash/maya/bank_transfer/check; `card_type`/`cash_received` conditional rules | PASS |
| Duplicate submissions | `idempotency` middleware on payment mutations (`billing/items/mark-paid` etc.) + `idempotency_keys` table | PASS |
| Transaction atomicity | Sale + items + stock deduction + payment in one `DB::transaction`; failure rolls back | PASS |
| Receipt totals | Generated from persisted sale rows, not client payload | PASS |

## Service billing / payment requests

- `service_billing_payment_requests` + `PaymentSettlement` models;
  cashier verification workflow tested (`VisitBillingPhaseCTest`,
  veterinary payment→completion chain in E2E).
- `reference_number`/`verified_at` fields with cashier-confirm
  requirement (prior audit report 05/06).

## AI receipt scanning

- `ProcessReceiptScan` job (tries=3, backoff) runs the
  `app/Services/Receipts/` pipeline (Gemini/OpenRouter vision + local
  OCR fallback) on `payment_receipts` rows.
- **Verified invariant:** OCR produces an extraction *draft* only —
  payment completion requires explicit cashier confirmation; low-
  confidence fields reviewable; reference numbers correctable;
  duplicate references rejected by unique constraint (prior audit
  report 06, re-verified).

## Financial reporting

- Admin/manager report controllers consume persisted sale/payment/
  settlement rows; report read-path indexes added
  (`add_report_read_path_indexes`); `docs/` reconciliation audits exist.
- VAT extracted (not added) consistently: backend `ReceiptBreakdown`,
  receipt email (`EmailContent`), cashier dashboard, service-request
  payments, customer store checkout, and frontend `pos.js` display —
  all aligned in prior audit commit `b952fa66`.

## Refunds/cancellations

- No payment-gateway refunds (no gateway integrated — GCash/Maya are
  manual reference payments). Cancellations exist for bookings with
  `cancellation_reason`; financial reversal is via supervisor-approved
  workflows, not self-serve refunds. Consistent with business rules.

## Residual notes

- No server-side discount engine — client discounts ignored entirely.
  If discounts are a launch requirement, that's a feature gap, not a
  defect (documented behavior; flag to product owner).
- `cash_received` validated only `min:0` for cash — no check that
  cash_received ≥ total; change calculation is client-side. Low risk
  (display math), worth noting.
- Manual payment references (GCash/Maya) rely on cashier verification —
  appropriate for the business model.

**Status: PASS** — financial integrity verified; no P0–P2 findings.
