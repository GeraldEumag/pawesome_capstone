# 09 — Database Integrity Audit

**Method:** read-only inspection of dev DB `pawesome` via artisan/PDO +
schema review of migrations. No writes, no migrations run against dev.

## Constraint & orphan checks (dev DB, live counts)

| Check | Result |
| --- | --- |
| `inventory_items.stock < 0` | **0** |
| Duplicate non-null `inventory_items.barcode` | **0** (unique index enforced) |
| `pets` without matching `customers` row | **0** |
| `appointments` without `pets` row | **0** |
| `boardings` without `pets` row | **0** |
| `sales.customer_id` → missing customer | **0** |
| `sale_items` orphan (no sale) | **0** |
| `inventory_logs` orphan (no item) | **0** |
| `payment_references` duplicate (provider, reference_normalized) | **0** (unique key holds) |
| Users with role outside the 7-role + super_receptionist set | **0** |

## Stock vs batch reconciliation

- `php artisan inventory:reconcile-stock` (dry-run): **"All items already
  in sync."** The reconcile command compares usable-batch totals against
  the flat counter; a naive `SUM(batches.quantity)` diff shows ~10 items,
  attributable to non-usable batch states (expired/disposed/marker rows)
  that the reconciler correctly excludes. **Not a defect.**
- Batch deduction is FEFO inside `deductStock`; write-off reasons reach
  expired lots; consumption reasons sellable-only — verified in code.

## Schema observations

- Money columns are decimal; VAT stored as computed `tax_amount` on the
  transaction (not a rate column) — consistent with the single
  `ReceiptBreakdown::VAT_RATE` authority.
- `payment_references(provider, reference_normalized)` unique index is
  the final dedupe safeguard for receipt confirmation.
- Legacy dual columns exist by design (`reference_number` +
  `payment_reference`, `previous_stock`/`new_stock` mirrors,
  `hotel_rooms` vs `boarding_rooms`) — controllers/services normalize;
  `PaymentReferenceGuard::REFERENCE_COLUMNS` and
  `ReceiptService::PAYABLE_TABLES` map both.
- Enum drift is handled defensively (`Schema::hasColumn`/`hasTable`
  guards throughout availability/receipt code) — verified pattern, no
  action needed.

## Test-DB parity

`phpunit.xml` pins `pawesome_test` on MySQL; `RefreshDatabase` migrates
fresh per run — the suite exercises the same schema as dev. CI runs the
full suite on MySQL 8 per `.github/workflows/ci.yml`.

## Verdict

**PASS** — no orphans, no negative stock, no duplicate barcodes or
payment references on the dev DB; drift tooling reports clean.
