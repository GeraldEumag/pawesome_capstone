# Phase 3.2 — Report 07: Inventory Alerts, Reports, and Reconciliation

**Status: PARTIAL**

## Search / filter / low-stock — PASS (browser)

Test `POS search, low-stock badge, and reports page reflect fixture data`:

- POS search by product name surfaced the fixture tile — PASS.
- Fixture at stock 1 (≤ reorder threshold 2, POS low-stock rule `stock > 0 && stock <= 5`) produced the `pos-alert-badge--warn` "Low" badge — PASS.
- `/inventory/reports` (InventoryReports) rendered report content — PASS.
- Evidence: `evidence/p32-pos-low-stock.png`, `evidence/p32-inventory-reports.png`.

UnifiedInventory search box (`Search by name, SKU, barcode, brand...`) was exercised in the adjustment and product-barcode tests — PASS for name/SKU; brand/category/supplier combined-filter matrix and pagination depth not exhaustively re-verified (fixture volume small).

## Stock movement / return / approval flows — PASS (browser)

`stock-movement.spec.js`: **10/10 PASS** on the Phase 3.2 stack — stock-in, immediate stock-out, manager approval deducts once, rejection untouched, return→inspect→restock once, quarantine hold/release, movement reversal, cashier page denial, idempotent replay, role denial on approve endpoint.

## Reconciliation — dry-run only, explained

`php artisan inventory:reconcile-stock` (DRY-RUN, no `--apply`) on `pawesome_phase3_2_browser_audit`:

- **8 planned actions**, all `create RECON batch (+N, item was never batch-tracked)` for `E2ESM-*` fixture items (#53–#60) created by `stock-movement.spec.js` via direct `stock` field (bypasses batch tracking by design of the fixture helper).
- Per-item table: all 8 discrepancies are **expected fixture artifacts** — items whose stock was set directly at creation rather than through stock-in batches. No unexplained discrepancy indicating an application defect was found in this disposable dataset.
- `--apply` was **not** run (requires explicit approval). Phase 3.1's 14 proposals on the Phase 3.1 DB were similarly fixture-driven; Phase 3.1 databases were not mutated.

## Reports consistency

- `/inventory/reports` loads live data via `/admin/reports/inventory` and renders stock summary + movement log tables; visible report matched fixture presence. Date-filter boundary and export (CSV/PDF/Excel) paths exist (`reportExport` utils) but were not exhaustively re-verified row-by-row in 3.2.
- Manager report reconciliation failures observed in the full backend suite are listed in Report 08 as suite-level failures requiring disposition — they are revenue/reporting-domain issues outside the inventory ledger verified here.

## Result

Search, low-stock alert, reports page, and movement flows: **PASS** (with noted coverage limits). Reconciliation: **PASS — understood; all proposals expected fixture artifacts; no apply**.
