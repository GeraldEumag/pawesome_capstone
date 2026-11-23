# Unit of Measure and Conversion Audit

## Observed data model

- `inventory_items.unit` stores an optional unit label.
- `service_item_usages.unit` can record a unit label for service usage.
- Inventory item stock, batch received/remaining quantities, stock movements, returns, POS sale quantities, and service usage quantities are represented as integer quantities in the inspected schema and mutation paths.
- No base-unit field, conversion-ratio table, per-item pack/box count, decimal conversion contract, or conversion application was found in the inspected inventory services.

## Audit result

The system can label the unit associated with an item, but this is not evidence that a pack or box is converted into individual sellable/consumable units. Stock-in, POS deduction, service consumption, return restoration, and movement history cannot be safely reconciled across units without a defined item-specific base unit and conversion quantity.

No conversion was added. This avoids inferring that every pack or box has the same number of pieces and avoids silently changing existing integer balances.

## Required policy decisions

1. Which units are allowed, and which is the canonical stock unit for each item?
2. Are conversion quantities item-specific and versioned when packaging changes?
3. Are fractional quantities permitted for any category?
4. What rounding/precision rule applies to POS and service consumption?
5. Does a return use the original sale unit or the canonical stock unit?
6. How should legacy quantities be migrated and reconciled without rewriting historical movements?

## Verification

- Existing stock/return/POS tests cover integer quantities and insufficient-stock handling.
- No valid conversion ratios were available, so conversion-specific tests are **POLICY BLOCKED / NOT RUN**.
- Do not mark piece/pack/box conversion complete based on the existence of the `unit` label.
