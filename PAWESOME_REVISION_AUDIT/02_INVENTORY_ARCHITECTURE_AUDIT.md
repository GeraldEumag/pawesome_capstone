# 02 — Inventory Architecture Audit

**Scope:** authoritative stock truth, item CRUD, barcode/UOM, pricing
semantics, image storage, conditional medicine fields, accidental stock
movement on edit. Verified against `backend/app/Services/InventoryService.php`,
`app/Http/Controllers/Inventory/*`, `app/Models/Inventory*`, frontend
`src/components/inventory/*`.

## Authoritative tables

| Table | Role |
| --- | --- |
| `inventory_items` | Item master; flat `stock` counter + `reorder_level`, `status` (active/inactive/discontinued), `archived_at` soft-archive |
| `inventory_batches` | Batch/lot truth: `quantity`, expiry, FEFO ordering; zero-qty marker rows exist for audit |
| `inventory_logs` | Movement ledger: `movement_type`, `reason`, `reason_code`, `stock_before/after`, actor (`user_id`, `role`, `performed_by`) |
| `inventory_stock_requests` (+ items) | Approval queue for sensitive stock-outs |
| `inventory_returns` | Customer/supplier returns with warranty fields |
| `stock_movements` (via StockMovementController) | Reversible movement view over `inventory_logs` |

Single stock truth = `inventory_items.stock`, kept in sync with batch sums
via `reconcileToStock()` when `hasRealBatches()`. The artisan
`inventory:reconcile-stock` dry-run reports **"All items already in sync"**
on the dev DB (a naive `SUM(batches.quantity)` diff shows 10 rows, but that
includes non-usable batch states the reconciler correctly excludes — not a
defect).

## Item create/edit

- Barcode: `inventory_items.barcode` has a **unique index**; validation
  `unique:inventory_items,barcode`; omitted barcode auto-generates a
  collision-checked **EAN-13** (`generateUniqueBarcode`, check-digit +
  existence retry, hard failure if exhausted). Verified.
- UOM: `resolveUomBaseQuantity()` converts entered unit → base units via
  per-item UOM multipliers; rejects unsupported units with a field-level
  error. Verified.
- Price semantics: `price` (selling) vs cost fields validated in
  `validateItemData()`; client cannot smuggle stock changes through edit —
  stock only moves via explicit stock actions (`adjustStock` rejects
  `increment` outright: "Stock increases must be recorded as a new batch").
- Images: private-disk upload with evidence photos
  (`api/inventory.jsx` upload/view endpoints); no public exposure.
- Conditional medicine fields enforced in validation (prior audit +
  spot-check consistent).

## Audit-data completeness

Every mutation writes `InventoryLog` with before/after stock, actor
user_id/role/name, reason, reference type/id — inside the same DB
transaction as the stock change. `ActivityLog::log` mirrors item-level
events. Verified at `adjustStock` (L324–435), `deductStock` (L443+),
`addStock`, `disposeBatch`, `recordStockOut`, reversal path (L2045+).

## Concurrency & integrity

- All stock mutations take `InventoryItem::lockForUpdate()` inside
  `DB::transaction` — check-then-write is atomic.
- `recordStockOut` sorts lines by item id before locking (deadlock
  avoidance, documented in code).
- Negative stock impossible: `adjustStock` throws on `newStock < 0`;
  `deductStock` throws on `stock < quantity`; stock-out lines reject
  `quantity > stock`.
- Expired batches **block sale** in `deductStock`
  (`hasExpiredBatches()` → exception); write-off reasons
  (damaged/expired/disposal/lost/correction) deduct from all physical
  batches incl. expired lots; consumption reasons deduct sellable batches
  only (FEFO).

## Verdict

Architecture matches prior audit claims. **PASS** — no new defects found
in this pass beyond items already fixed in earlier engagement phases.
