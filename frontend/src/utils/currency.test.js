import { describe, it, expect } from "vitest";
import { formatCurrency } from "./currency";

describe("formatCurrency (PHP / en-PH)", () => {
  it("renders the peso sign, not a dollar sign or PHP code", () => {
    const out = formatCurrency(1250);
    expect(out).toBe("₱1,250.00");
    expect(out).not.toContain("$");
    expect(out).not.toContain("PHP");
  });

  it.each([
    [0, "₱0.00"],
    [150, "₱150.00"],
    [1250, "₱1,250.00"],
    [25000.5, "₱25,000.50"],
    [-500, "-₱500.00"],
    [1234567.89, "₱1,234,567.89"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatCurrency(input)).toBe(expected);
  });

  it("handles null, undefined and NaN as zero", () => {
    expect(formatCurrency(null)).toBe("₱0.00");
    expect(formatCurrency(undefined)).toBe("₱0.00");
    expect(formatCurrency(NaN)).toBe("₱0.00");
    expect(formatCurrency("not-a-number")).toBe("₱0.00");
  });

  it("handles numeric strings", () => {
    expect(formatCurrency("1250")).toBe("₱1,250.00");
    expect(formatCurrency("25000.50")).toBe("₱25,000.50");
    expect(formatCurrency("")).toBe("₱0.00");
  });

  it("rounds to two decimal places", () => {
    expect(formatCurrency(1.005)).toBe("₱1.01");
    expect(formatCurrency(99.999)).toBe("₱100.00");
  });

  it("respects fraction-digit overrides", () => {
    expect(formatCurrency(1500, { minimumFractionDigits: 0, maximumFractionDigits: 0 })).toBe("₱1,500");
    expect(formatCurrency(1500.5, { maximumFractionDigits: 4 })).toBe("₱1,500.50");
  });
});
