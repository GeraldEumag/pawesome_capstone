# Cashier Fix Changelog

Date: 2026-11-18 · Every fix addresses a **confirmed, reproduced** defect. No redesigns, no unrelated edits, pink UI untouched, zero new dependencies, zero migrations.

## P1 — three cashier endpoints always returned 500 (enum violations)

**Root cause:** `sales.status` = `enum('pending','completed','cancelled','refunded')` and `sales.type` = `enum('appointment','boarding','product')`. `DashboardController` wrote values outside both enums → `SQLSTATE[01000] Warning 1265 Data truncated` → 500 on every call. Verified live pre-fix.

### F-01 `POST /cashier/void` — `DashboardController::voidTransaction()`
- `status='voided'` → **`status='cancelled'`** (matches `POSController::voidTransaction` / `markAsCancelled`).
- Guard extended: `['cancelled','refunded','voided']` — a refunded sale can no longer be double-reversed.
- The rest of the method (stock restore, `Payment::processRefund`, `Invoice::cancel`, activity log) was already correct and is untouched.
- Verified: sale #79 → `cancelled`, payment `refunded`, success 200.

### F-02 `POST /cashier/refund` — `DashboardController::refund()`
- `type='refund'` → **`type => $sale->type ?: 'product'`** (refund row mirrors the parent's sale type).
- **Second-layer defect:** `Sale::saving` clamps `amount` to `max(0,…)`, which would have silently written the refund row at ₱0 — defeating the documented negative-amount netting design. Added a scoped exception: `payment_type='refund'` rows keep their negative amount. All other Sale writes keep the clamp.
- Verified: refund row `amount=-100.00`, `type='product'`, `payment_type='refund'`.

### F-03 `POST /cashier/multi-payment` — `DashboardController::multiPayment()`
- `type='multi_payment'` → **copies the linked sale's type, else `'product'`** (split-tender audit rows belong to POS context).
- Verified: ₱0 audit row `payment_type='multi'`, 200.

## P1 — F-04 transactions feed double-listed payments — `DashboardController::transactions()`

- Mirrored-paid `service_requests` (settled through a linked boarding/grooming/appointment) appeared both as `SERVICE-*` and `SETTLEMENT-*` rows for one payment (live evidence: SERVICE-249 + SETTLEMENT-61, same ₱500).
- Fix: `whereNotExists` on `boardings`/`groomings`/`appointments`/`medical_confinements` for the SR leg — the same dedupe `Admin\ReportsController` already uses (settlement leg is authoritative).
- Verified: SERVICE-249/SERVICE-1 gone from feed; unlinked SRs still listed (regression-tested).

## P2 — F-05 settlement `payment_method` NULL — `PaymentVerificationService::verifyTablePayment()`

- Settlement recorded `$record->payment_method` (pre-update) while counter-cash writes `'cash'` into `$updateData` — so counter-cash settlements persisted `NULL`.
- Fix: read the post-update `$settled` row (already re-fetched for the authoritative total): `$settled->payment_method ?? $record->payment_method ?? null`.
- Verified: `payment_settlements.payment_method='cash'` on walk-in grooming settlement (regression test).

## P2 — F-06 dashboard revenue included cancelled sales — `DashboardController::overviewData()`

- `today_sales`, `monthly_sales`, `sales_by_type`, `today/monthly_transactions`, `completed_payments`, `top_selling_products` had no status filter; cancelled/refunded sales inflated figures.
- Fix: `where('status','completed')` on all six aggregates (completed-only = the valid revenue bucket; refund rows are `completed` with negative amounts and net correctly).
- Verified: cancelled ₱50 sale excluded from totals/by-type (regression test).

## P2 — F-07 repeat-refund bound — `DashboardController::refund()` (pre-push review)

- The revived refund endpoint bounded each call only by `sale->amount` — repeated calls could over-refund one sale and drain revenue sums.
- Fix: cumulative bound — prior refund rows for the parent (linked via the established `Refund for {txn}:` notes convention) are summed and the new refund must fit the **remaining** refundable amount.
- Verified: 2nd refund exceeding the remainder → 422; regression test added.

## Files changed

- `backend/app/Http/Controllers/Cashier/DashboardController.php` — F-01/02/03/04/06/07
- `backend/app/Services/PaymentVerificationService.php` — F-05 (1 line)
- `backend/app/Models/Sale.php` — refund-row clamp exception (F-02b)
- `backend/tests/Feature/CashierDashboardDefectsTest.php` — **new**, 8 tests / 42 assertions

## Deliberately NOT changed (documented P3/observations)

- DB enums unchanged (code conformed to schema, not vice-versa — no migration needed).
- `pos.js::generateReceipt` (dead, wrong store info/VAT — proven unreferenced, left per minimal-change scope), `cashierEndpoints.js` `MOCK_DATA` (flag off), unrouted `CashierPaymentVerification.jsx`, dead private helpers, `*_Polished.css`.
- `applyDiscount` — read-only calculator with hardcoded demo codes; POS discounts are intentionally not persisted (no discount engine exists).
- `gift-cards/{n}/balance` — auth-only read endpoint; acceptable.
- `sales.cash_amount/card_amount` decimal(8,2) — noted for future widening.
- `Sale::VALID_STATUSES`/`VALID_TYPES` supersets — benign now that all writes emit DB-legal values.
- Pre-existing `payment_settlements.payment_method IS NULL` rows — append-only ledger, not rewritten.

## Regression evidence

`CashierDashboardDefectsTest` 7/7 · scoped suite 64/64 (349 assertions) · **full suite 1075 passed / 1 skipped / 0 failed** · e2e 29/29 on the isolated audit stack.
