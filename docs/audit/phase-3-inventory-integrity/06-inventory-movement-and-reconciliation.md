# Inventory Movement and Reconciliation Audit

## Ledger

`inventory_logs` is the movement history. Current mutation paths record movement type, quantity/delta, stock before and after, reason, actor/role, references, and transaction numbers where applicable. Reversals preserve the original row, cap reversal quantities, and add a separate reversal movement. The Phase 3 changes did not rewrite or delete historical rows.

Stock mutation and batch mutation are centralized in `InventoryService`; batch deductions use the item issue method (FIFO/FEFO) and exclude expired lots where required. Reconciliation can create additive `RECON-*` batches instead of rewriting prior movements. The monthly physical audit records system count, physical count, variance, approval status, and approver.

## Evidence and limitations

- `StockMovementTest` passed receiving, stock-out, correction, reversals, returns, batch ownership validation, and ledger lifecycle cases.
- The broader focused backend bundle passed batch reconciliation, archive, dashboard/report, role, and adjustment suites.
- The current dedicated test database check reported: 1 inventory item, 0 batches, 2 inventory logs, 0 returns, 1 sale, 1 sale item, and 2 idempotency keys after test execution. The sale/item/idempotency rows are expected fixtures from the separate-request POS concurrency test; this test database is isolated.
- No Phase 3 stock reconciliation was run against `pawesome` or production. Historical data-hygiene reports describe the prior authorized development-DB work and 12 unrecoverable actor-less legacy movements; no actor was fabricated.
- `pawesome_phase3_inventory_audit` had all 191 migrations reported `Ran`, including `2026_11_22_000001_stock_movement_system`.
- The inventory movement ledger was not reconciled against a live production database or MySQL 8.

## Conclusion

Current transaction and ledger mechanisms are supported by source and isolated regression tests. Historical rows remain immutable. Full retained-data reconciliation, backup/restore, MySQL 8 parity, and production ledger parity remain **UNVERIFIED**.
