# Inventory Integration & Stock Audit

**Date:** 2026-11-17

## Model

`inventory_items` (stock, reorder_level, cost, price, generic_name, brand, expiry tracking) → `inventory_batches` (FIFO/FEFO receiving) → `inventory_logs` (every movement w/ before/after + actor) → `inventory_monthly_audits` (variance + manager approval) → `suppliers`.

## Verified behavior

| Check | Evidence | Result |
| --- | --- | --- |
| Batch receiving creates distinct batches; FIFO deducts oldest; FEFO for expiry-tracked | `InventoryBatchReconciliationTest` | PASS |
| Stock increase only via batch receive; remove/set via adjustment | same | PASS |
| Over-decrement → 422, no negative stock | tests + DB check `stock<0` = 0 | PASS |
| POS sale self-heals drift; expired batch blocks sale; marker batch doesn't block | same suite | PASS |
| Audit variance needs manager approval; deficit writes off, surplus creates batch | `PharmacyConfinementPhaseDTest`, monthly-audit tests | PASS |
| `inventory:reconcile-stock` repairs drift (RECON- batches) | command test | PASS |
| Idempotent batch receive | same-key replay test | PASS |
| Service consumption (grooming/vet/boarding add-ons) deducts once, restores on post-approval reject | P1 add-on tests | PASS |
| Archive-not-delete with reason for items with history | `InventoryArchiveDeletionTest` | PASS |
| Low-stock dashboard + reports | `InventoryDashboardTest` | PASS |
| Inventory logs record actor/role/reason | logs schema + tests | PASS |
| Generic + brand name fields | `generic_name`, `brand` columns present | PASS |
| Client can't set stock | server-side only | PASS |

## DB integrity (this run, `pawesome`)

Orphans `inventory_logs→items` = 0 · negative stock = 0.
