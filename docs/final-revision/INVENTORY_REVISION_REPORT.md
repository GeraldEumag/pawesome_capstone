# INVENTORY_REVISION_REPORT.md — FR-01 / FR-02

**Date:** 2026-11-24 · **Commits:** `b852fb26` (feature), tracker rows FR-01/FR-02

## FR-01 — Units of measure (FEATURE_GAP, P2) — FIXED

**Before:** `inventory_items.unit` was a display-only varchar; stock in/out/returns accepted base-unit integers only; no piece/pack/box conversion existed.

**Change:**
- Migration `2026_11_24_000001`: `pack_size`, `box_size`, `unit_options` (JSON) on `inventory_items`.
- `InventoryService::recordStockIn`/`recordStockOut`: accept a `unit` tag; convert to base units via pack/box size before mutation. Physical-count adjustments, customer returns, and POS remain base-unit by design (documented limitation).
- Frontend: `uom.js` shared helper; unit selectors on `StockInPage`/`StockOutPage`; `AddProductModal` exposes pack/box/unit fields; item payloads expose the new fields.

**By design (unchanged):** returns/dispositions and POS sell in base units — prevents ambiguous partial-pack returns.

## FR-02 — SKU/barcode generation (FEATURE_GAP, P2) — FIXED

**Before:** SKU auto-generated but collision → 422; barcode required for sellable items with no generator.

**Change:**
- `InventoryService::generateEAN13`: valid check-digit EAN-13, uniqueness-checked, auto-filled on sellable item creation when barcode absent.
- SKU generation retries on collision instead of failing.
- Cannot-clear-barcode-on-update rule preserved; barcode lookup (`GET /api/products/barcode/{code}`) resolves generated codes.

## Evidence

| Check | Result |
|---|---|
| `InventoryUnitOfMeasureTest` (new, 9 tests) | 9/9 PASS on MySQL 8 |
| `BarcodeLookupTest` (updated) | PASS |
| Regression: `StockMovementTest`, `InventoryRoleAuthorizationTest`, `InventoryBatchReconciliationTest` | 55 tests PASS |
| Frontend `AddProductModal.test.jsx` | 2/2 PASS (vitest) |
| Migrations on MySQL 8 (`pawesome_test` + dev `pawesome`) | Ran clean; reversible `down()` present |

## Traceability

- Backend: `app/Services/InventoryService.php`, `app/Models/InventoryItem.php`, `app/Http/Controllers/Inventory/StockMovementController.php`
- Frontend: `components/inventory/{AddProductModal,StockInPage,StockOutPage,uom.js}` (+ css)
- Tests: `tests/Feature/InventoryUnitOfMeasureTest.php`, `tests/Feature/BarcodeLookupTest.php`
