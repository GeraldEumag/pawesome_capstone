# Stock In, Stock Out, and Adjustment Audit

## Receiving

Stock-in requests are handled through `StockMovementController` and `InventoryService`. The service creates a transaction number, validates line quantities and reason-specific fields, locks items, applies stock or batch receiving, and records before/after values with actor and reference metadata. FEFO items require expiration dates. Batch receiving creates/updates batch-level remaining quantities and calls the shared batch-stock path. No separate purchase-order lifecycle was evidenced; receiving is inventory movement/batch based.

`StockMovementTest` passed multi-item receiving, FEFO-expiration validation, and reason-field checks. Existing batch reconciliation and batch-system tests also passed in the focused backend bundle. No Phase 3 migration was added.

## Stock out and adjustments

`InventoryService::recordStockOut()` validates reason codes and required context, sorts item lines before locking, rechecks active/unarchived records, rejects overdraw, and either executes a supported immediate reason or creates a pending manager/admin approval request. Pending requests do not deduct stock. Adjustment endpoints delegate to the shared service and maintain the ledger.

The focused tests passed stock-out, overdraw, correction, approval, rejection, reversal, adjustment, and batch-synchronization cases. `InventoryRoleAuthorizationTest` and `StockAdjustmentEndpointsTest` were included in the backend regression bundle.

## Authorization/integrity

- Backend routes, not hidden buttons, enforce role checks.
- Catalog updates cannot directly set stock through the product endpoint.
- Multi-item stock changes are transaction-bound and use deterministic item lock order.
- Return intake is not treated as a stock increase; it remains pending inspection until an approved restock disposition.
- Idempotency middleware supports keyed POST retries. The returns UI now retains the same key through uncertain failures and rotates it after deterministic 4xx outcomes.

## Results

- `StockMovementTest`: 23 passed, 146 assertions.
- Focused inventory/POS/receipt regression command: 97 passed, 467 assertions.
- Separate concurrent source-return test: 1 passed, 9 assertions.
- All tests targeted only `pawesome_phase3_inventory_audit` on local MariaDB 10.4.32.
- Production stock, purchase accounting, supplier-return workflows, and non-integer conversion remain outside the verified scope.
