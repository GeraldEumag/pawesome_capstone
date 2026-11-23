# Security, Authorization, and Database Integrity Audit

## Authorization evidence

- Product and inventory mutations are protected by authenticated staff routes and role middleware.
- Inventory write routes require inventory/admin capability; sensitive stock-request approvals require manager/admin.
- Barcode/SKU lookup is authenticated and restricted to cashier, inventory, and admin.
- Public inventory reads are separate from internal operational lookups.
- Backend tests in the focused regression bundle included `InventoryRoleAuthorizationTest`; existing direct API authorization tests passed.
- Customer self-service product checkout remains disabled. No frontend hiding was treated as authorization evidence.

## Integrity mechanisms

- SKU and barcode uniqueness are enforced by validation and database indexes.
- Stock changes use transactions and row locks; multi-item movement lines sort by item ID before locking.
- Batch stock is tracked separately and reconciled against item stock.
- Returns have a unique return number, but the database does not enforce a source/item cumulative quantity aggregate. Phase 3 now serializes that check using the inventory item row lock.
- Idempotency records key user, route, and request payload. Reusing a key for a different payload returns 409. Return UI now retains keys correctly across uncertain retries.
- Ledger and batch history are not overwritten during ordinary reversals; reversals are separate movements.

## Concurrency and tests

- `InventoryConcurrentReturnTest`: 1 pass / 9 assertions; synchronized independent API workers attempted to return the same final sold unit; one request was rejected and persisted quantity remained capped.
- `PosConcurrentStockTest`: pass in the focused bundle; the last unit could not be sold twice.
- Backend focused command: 97 passed / 467 assertions; stock movement: 23 passed / 146 assertions.
- No MySQL 8 run occurred. The database engine was MariaDB 10.4.32.

## Safety and unresolved risks

- All Phase 3 mutation tests ran only against `pawesome_phase3_inventory_audit`. No development or production application data was changed.
- The test schema is a dedicated local MariaDB database and contains expected test fixtures; it was not dropped after execution.
- Full E2E cross-database write-probe guard/browser mutation tests were not run in this pass, so no claim is made about a fresh browser-isolation proof.
- File upload validation/storage is covered by existing inventory evidence and storage audit; Phase 3 did not change upload paths.
- A complete production permission matrix, MySQL 8 CI parity, restore drill, load test, and retained-data reconciliation remain open.
