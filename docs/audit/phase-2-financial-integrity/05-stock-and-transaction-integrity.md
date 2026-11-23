# Stock and Transaction Integrity

## Findings

- POS begins a database transaction before price/stock resolution and sale writes.
- `InventoryItem::lockForUpdate()` serializes product stock checks; `InventoryService::deductStock()` locks/rechecks stock and delegates batch deductions to the existing FEFO path.
- Sale items, stock movements, payment, invoice and receipt-email intent are written in the same transaction. Existing `TransactionAtomicityTest` covers late-failure rollback and insufficient stock.
- `IdempotencyKey` stores/replays deterministic responses inside its transaction and serializes keyed requests using the authenticated user's row. POS now requires the key.
- Frontend retains the same key for uncertain network/server failures, but rotates after 4xx responses so a corrected request does not replay a cached validation/domain error.
- Void logic locks the sale and checks cancelled status before restoring stock. Existing tests cover sequential double-void protection.

## Risks and limits

- `PosConcurrentStockTest::test_two_concurrent_pos_requests_cannot_sell_the_last_unit_twice` executed two separate Laravel request workers behind a barrier against one remaining unit. Result: one HTTP 200, one HTTP 422, one sale/item/payment, and stock zero.
- Service rows are now locked for the active check/price read, but no service capacity policy exists; no arbitrary quantity limit was added.
- The historical POS `discount_code` field is not backed by an approved sale discount engine. Discount treatment remains a policy clarification, not a new calculation.
- No inventory service or stock-deduction mechanism was duplicated; no migration was added.

## Test status

- POS pricing/rollback/idempotency, existing transaction atomicity/void, authorization and customer-order descope suites: **PASS**, 48 tests / 271 assertions.
- Concurrent last-unit test: **PASS**, 1 test / 10 assertions on local MariaDB 10.4.32.
- Residual: concurrency has not been verified on MySQL 8.
