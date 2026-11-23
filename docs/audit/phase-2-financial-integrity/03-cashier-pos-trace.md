# Cashier POS Trace

## Request path

1. `frontend/src/components/cashier/CashierPOS.jsx` loads POS products/services from `GET /cashier/pos/products` and `/cashier/pos/services`, displays a client-side estimate, and posts identifiers, quantities, tender and display hints to `/cashier/pos/transaction`.
2. The active checkout generates one UUID per logical sale and sends `Idempotency-Key`. It requires complete server receipt items/subtotal/VAT/net/total before clearing the cart; it does not substitute local cart values if the response is incomplete.
3. `backend/routes/api.php:404-452` groups POS endpoints under `auth.api`, API throttling and `role:cashier`; the transaction route adds idempotency middleware.
4. `Cashier\POSController::processTransaction` validates request shape, starts a transaction, locks eligible product rows, resolves prices and names, computes gross totals/VAT, writes sale/items, calls `InventoryService::deductStock`, writes payment/invoice and receipt-email outbox intent, and commits.
5. The response receipt is produced from persisted `Sale`, `SaleItem`, `Payment` and `Invoice` values. Transaction history uses the corresponding read endpoints.

## Persistence and stock

- `sales`: customer/cashier, status, subtotal, `tax_amount`, `discount_amount`, `total_amount`, payment type and transaction reference fields (base migration `2025_04_07_090000_create_pawesome_tables.php`, expanded by later migrations).
- `sale_items`: sale, product/service foreign key, `item_name`, quantity, unit price, discount and line total (`2026_04_21_000001_create_sale_items_table.php`).
- `payments`: sale, method/reference, amount, change, status, paid timestamp (`2026_04_21_000002_create_payments_table.php`).
- `invoices`: sale/customer, invoice number, status, subtotal, tax, discount, total and paid timestamp (`2026_04_21_000003_create_invoices_table.php`).
- `inventory_items.stock` is decremented through `InventoryService::deductStock`, with batch/log tracking as applicable. The service locks the item row and checks current stock/expiry; the POS transaction encloses this with sale/payment writes.

## Verified source behavior

- Server product and service prices, not client-supplied prices, determine persisted totals.
- Cash underpayment is rejected before payment completion; payment amount is the backend total.
- Sale/payment/invoice writes and stock deduction are transactionally grouped.
- The sale void path locks the sale and checks cancelled status before restoring stock, preventing a second restore in the sequential flow.
- The cashier route group enforces backend authorization independently of frontend route visibility.

## Fixes in this phase

- Active service lookup now checks `is_active` under a row lock.
- Persisted sale item and receipt/email names now come from the database.
- POS route now requires an idempotency key; the existing middleware serializes keyed requests on the authenticated user row and replays the stored response.

## Runtime tests

Focused POS, atomicity, authorization and last-unit concurrency tests ran on the verified disposable test database. The focused POS/transaction/authorization set passed 48 tests; the separate concurrent test passed with one successful and one rejected request.
