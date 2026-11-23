# Implementation Changelog

## Backend

- `backend/app/Http/Controllers/Cashier/POSController.php`
  - Removed client item-name lookup/trust.
  - Resolve and persist product/service names and prices from eligible database rows.
  - Require active services under lock.
  - Accept item IDs/quantities without requiring client display price/name.
  - Round line gross and subtotal to two decimals; preserve existing VAT-inclusive formula.
- `backend/app/Http/Middleware/IdempotencyKey.php`
  - Added required-key mode while retaining optional behavior for other routes.
- `backend/routes/api.php`
  - POS sale route uses required idempotency mode.
- `backend/app/Http/Controllers/Customer/CustomerStoreController.php`
  - Historical receipt breakdown now uses persisted `$totalAmount`, fixing the undefined variable.
- `backend/resources/views/emails/payment-receipt.blade.php`
  - Uses the exact X-15 labels `VAT 12% (included)` and `TOTAL (VAT INCLUDED)`; the stale email test assertion expecting VAT subtraction was updated.
- `backend/tests/TestCase.php`
  - Existing POS feature tests simulate the active client by defaulting an idempotency key; a required-key test supplies an explicitly empty header.
- Added `PosFinancialIntegrityTest.php` and `CustomerHistoricalReceiptIntegrityTest.php`.
- Added `PosConcurrentStockTest.php` plus a separate-request worker fixture; it races two requests against one unit using a barrier.
- Updated stale payment email expectations to assert the exact X-15 inclusive labels rather than the old VAT-subtraction wording; the outbox and email tests pass.

## Frontend

- `frontend/src/components/cashier/CashierPOS.jsx` rotates the sale key after deterministic 4xx responses while retaining it for uncertain errors.
- `frontend/src/api/pos.js` sends an idempotency key for exported POS transaction calls.
- `frontend/src/utils/posReceipt.js` validates that receipt totals/items come from the server; `posReceipt.test.js` covers authoritative parsing and incomplete-response rejection.

## Preserved

- Previous X-15 label code/tests remain intact.
- Customer store product checkout remains disabled.
- No application migration was added; manuscript, prior audit reports, vaccination workflow and inventory service were not changed, and no payment provider was called.
