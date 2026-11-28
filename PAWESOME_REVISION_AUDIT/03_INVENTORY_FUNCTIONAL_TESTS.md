# 03 — Inventory Functional Tests

**Method:** existing PHPUnit feature/unit coverage re-run on
`pawesome_test` (MySQL) during this audit + targeted new tests where gaps
were found. Frontend vitest suites for inventory components run in Stage 8.

## Coverage map (existing suite)

| Area | Test file(s) |
| --- | --- |
| Item CRUD, validation, archive/delete reasons | `InventoryTest`, `InventoryArchiveDeletionTest`, `InventoryDashboardTest`, `InventoryItemValidationTest` (unit) |
| UOM packaging/conversion | `InventoryUnitOfMeasureTest` |
| Barcode lookup/generation | `BarcodeLookupTest` |
| Batch lifecycle & reconciliation | `InventoryBatch5SystemTest`, `InventoryBatchReconciliationTest` |
| Stock movements, reversal, audit | `StockMovementTest`, `StockAdjustmentEndpointsTest` |
| Concurrency (oversell, returns) | `PosConcurrentStockTest`, `InventoryConcurrentReturnTest`, `ServiceInventoryUsageAtomicityTest` |
| RBAC on inventory endpoints | `InventoryRoleAuthorizationTest`, `AdminBatch7SystemTest`, `PublicInventoryExposureTest` |
| Cross-module stock effects | `CashierBatch3SystemTest`, `VetBatch4SystemTest`, `ReceptionistBatch2SystemTest`, `CustomerBatch1SystemTest`, `ManagerBatch6SystemTest`, `Phase4InventoryPayslipTest` |

## Results

- Full backend suite baseline (pre-fix): **1282 passed / 5 failed / 1
  skipped**; all 5 failures proven pre-existing date-bombs (see
  `00_BASELINE_REPORT.md`) and **fixed** — post-fix targeted re-run of the
  five affected files + new species tests: **74/74 pass**.
- Post-fix full-suite re-run is executed in Stage 8; results recorded in
  `12_AUTOMATED_TEST_RESULTS.md`.
- New test added this audit: `tests/Feature/PetSpeciesEnforcementTest.php`
  (11 tests) covering species enforcement across grooming, appointment,
  chatbot, walk-in and boarding channels.

## Gaps noted

- No dedicated test asserting `inventory:reconcile-stock --apply`
  idempotency on a drifted fixture; the dry-run path is exercised manually
  (clean on dev DB). LOW priority — command is read-only by default.
- Frontend vitest coverage for `StockOutPage` reason-field matrix exists
  (`StockReturnsPage.test.jsx`, `AddProductModal.test.jsx`,
  `inventory.test.js`); extended only if Stage 6 finds defects.
