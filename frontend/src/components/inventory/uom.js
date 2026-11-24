/**
 * Units-of-measure helpers for inventory stock transactions (panel §8.3).
 * Mirrors backend InventoryItem::uomOptions()/uomMultiplier() — the API
 * returns `uom_options` on item search payloads; fall back to base-only
 * when an item payload predates the field.
 */

export const DEFAULT_UOM_OPTIONS = [{ unit: "base", label: "Piece", base_units: 1 }];

export const uomOptionsFor = (item) => {
  const opts = item?.uom_options;
  if (Array.isArray(opts) && opts.length > 0) return opts;
  const baseLabel = item?.unit ? item.unit.charAt(0).toUpperCase() + item.unit.slice(1) : "Piece";
  return [{ unit: "base", label: baseLabel, base_units: 1 }];
};

export const uomMultiplier = (item, unit) =>
  uomOptionsFor(item).find((o) => o.unit === unit)?.base_units ?? 1;

export const baseQuantity = (item, enteredQty, unit) =>
  (parseInt(enteredQty, 10) || 0) * uomMultiplier(item, unit);

export const formatUomHint = (item, enteredQty, unit) => {
  const mult = uomMultiplier(item, unit);
  const base = baseQuantity(item, enteredQty, unit);
  if (unit === "base" || mult === 1 || !enteredQty) return null;
  const baseLabel = uomOptionsFor(item)[0]?.label?.toLowerCase() || "units";
  return `= ${base} ${baseLabel}`;
};
