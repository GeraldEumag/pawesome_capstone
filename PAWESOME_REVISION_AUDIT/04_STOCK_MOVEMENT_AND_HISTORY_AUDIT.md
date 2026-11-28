# 04 — Stock Movement & History Audit

## Movement ledger integrity

`inventory_logs` is the single ledger. Verified fields on every write:
`movement_type` (stock_in/stock_out/stock_adjustment_*/sale/restock/
dispose/return/reversal…), `reason` + `reason_code`, `quantity`, `delta`,
`stock_before`/`stock_after` (+ legacy `previous_stock`/`new_stock`
mirrors), `reference_type`/`reference_id`, actor triple
(`user_id`, `role`, `performed_by`), `details` JSON, `line_details` for
multi-item ops.

## Flow-by-flow verification

| Flow | Transaction | Locking | Negative-stock | Logging | Idempotency |
| --- | --- | --- | --- | --- | --- |
| `adjustStock` | yes | `lockForUpdate` item | rejected (`newStock<0`, decrement≤0, increment banned) | full audit row + ActivityLog | n/a (absolute set/decrement) |
| `deductStock` (POS/orders/services) | caller tx | item lock | `stock < qty` throws | FEFO batch consumption logged | POS guarded by `Idempotency-Key` middleware |
| `recordStockOut` | yes | sorted multi-item locks | per-line `qty > stock` rejected | `stock_out` movement per line, `transaction_no` groups batch | sensitive reasons → approval queue, no stock touched until approved |
| Stock-in / receiving | yes | item lock | n/a | batch + log rows | batch_no sequence |
| Returns (`InventoryReturn`) | yes | return + item locks | oversell guarded (`InventoryConcurrentReturnTest`) | return movement + restock/quarantine decision | status transitions guarded |
| Reversal (`reverseMovement`) | yes | log + item locks | recomputes availability | `reversal_of` linkage | reversible-type whitelist excludes POS/sale/service deductions (no double-restore) |
| Batch dispose | yes | batch + item locks | n/a | `Batch disposed:` log | single transition |

## History completeness

- `StockMovementsPage` reads the ledger with filters (`reason_code`,
  date, item, movement type) — backend `StockMovementController` exposes
  the same filters; no frontend-only math.
- Item detail/history views read `inventory_logs` + batches; low-stock and
  expiry alerts derive from `stock <= reorder_level` and batch expiry —
  notifications deduped via `checkAndCreateStockNotifications`.
- Audit variance workflow (`DashboardController` reject path) appends
  `[Rejected: reason]` to the locked audit row inside a transaction.

## POS/order stock synchronization

- POS checkout deducts via `InventoryService::deductStock` inside the
  sale transaction → oversell impossible under concurrency
  (`PosConcurrentStockTest` proves it).
- Customer orders and vet/grooming/boarding service consumption use the
  same centralized deduction; service consumption is excluded from the
  manual-reversal whitelist to prevent double-restores.

## Verdict

**PASS.** Ledger is complete, atomic, locked, and reversal-safe. The only
historical-data concern (12 actor-less legacy log rows) was already root-
caused and fixed in the prior engagement (InventoryItem hook / legacy
helpers now write full metadata inside transactions).
