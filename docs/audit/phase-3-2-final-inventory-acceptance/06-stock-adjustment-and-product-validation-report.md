# Phase 3.2 — Report 06: Stock Adjustment Boundary and Product Validation

**Status: PASS** (browser + API, isolated stack)

## A. Manual stock adjustment — browser test `manual adjustment UI enforces quantity/reason rules and records movement` — PASS

Route: `/inventory/stock` (UnifiedInventory stock mode) → row Actions popover → `Receive / Adjust Stock` → `StockAdjustmentModal`.

| Case | Expected (from source) | Observed |
|---|---|---|
| Missing reason | Submit disabled (`disabled={loading \|\| !hasQty \|\| !reason}`) | PASS — button disabled |
| Quantity `0` | `hasQty` false → disabled | PASS — disabled |
| Valid add qty 3, reason selected | Submit enabled → success | PASS — "Stock Adjusted" / "Stock updated successfully." |
| Unauthorized role (cashier) direct API `POST /inventory/items/{id}/adjust-stock` | 401/403 | PASS — rejected |
| Stock after | 4 → 7 | PASS |
| Movement persistence | `inventory_logs` rows exist for item | PASS (≥1 row, latest movements present) |

Not exercised in browser: overdraw-remove (modal defaults to `add`; remove path guarded by same `hasQty`/reason rules and backend `stock adjustment cannot go negative` + `deduct stock beyond available changes nothing` tests — PASS), duplicate submission (idempotency key generated per modal open; backend idempotency middleware on route), excessive decimal precision (input is integer stepper/`parseInt`). Evidence: `evidence/p32-adjust-form.png`, `evidence/p32-adjust-success.png`.

## B. Product validation — browser + API — PASS

- Browser: Phase 3.1 spec `phase3-1-product-barcode.spec.js` re-run on Phase 3.2 stack — **PASS** (blank barcode blocked for sellable; blank SKU server-generated; barcode lookup returns item). Port assertion generalized to `E2E_API_URL` origin (test-harness fix only).
- API boundary test `product validation rejects duplicate barcode and invalid price` — **PASS**:
  - Duplicate barcode → HTTP 422.
  - Negative price → HTTP 422.
- Backend suite coverage (isolated run): `duplicate sku rejected`, `required fields validated`, `price must be numeric`, `auto generated SKU`, `low stock items returned` — all PASS.

## Limitations

- Full invalid-field matrix (invalid category/brand/supplier/unit) is partially covered by backend validation tests; not every field was re-driven through the browser form.
- Pagination of the products table was not stress-tested (fixture set small).
