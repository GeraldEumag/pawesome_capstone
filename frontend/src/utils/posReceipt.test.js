import { describe, expect, it } from "vitest";
import { normalizeAuthoritativePosReceipt } from "./posReceipt";

describe("normalizeAuthoritativePosReceipt", () => {
  it("returns amounts and items from the persisted server receipt", () => {
    const normalized = normalizeAuthoritativePosReceipt({
      receipt: {
        subtotal: "112.00",
        vat_amount: "12.00",
        total: "112.00",
        breakdown: { net_amount: 100, vat_amount: 12 },
        items: [{ name: "Server item", quantity: 1, unit_price: "112.00", total: "112.00" }],
      },
    });

    expect(normalized).toMatchObject({
      total: 112,
      subtotal: 112,
      vatAmount: 12,
      netAmount: 100,
      items: [{ item_name: "Server item", quantity: 1, unit_price: 112, total_price: 112 }],
    });
  });

  it("rejects incomplete responses instead of falling back to cart totals", () => {
    expect(() => normalizeAuthoritativePosReceipt({
      receipt: { total: 999, items: [] },
      transaction: { total_amount: 999 },
    })).toThrow(/complete receipt totals/);
  });

  it("rejects null financial fields instead of treating them as zero", () => {
    expect(() => normalizeAuthoritativePosReceipt({
      receipt: {
        subtotal: null,
        vat_amount: null,
        total: null,
        net_amount: null,
        items: [{ name: "Server item", quantity: 1, unit_price: 112, total: 112 }],
      },
    })).toThrow(/complete receipt totals/);
  });
});
