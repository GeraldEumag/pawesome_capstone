import { describe, expect, it } from "vitest";
import { normalizeList } from "./client";

describe("normalizeList", () => {
  it("returns a bare array unchanged", () => {
    const list = [{ id: 1 }];
    expect(normalizeList(list)).toBe(list);
  });

  it("prefers the first matching priority key", () => {
    const result = { pets: [{ id: 1 }], items: [{ id: 2 }] };
    expect(normalizeList(result, ["pets"])).toEqual([{ id: 1 }]);
  });

  it("falls back to the data, items, and named list keys", () => {
    expect(normalizeList({ data: [1] })).toEqual([1]);
    expect(normalizeList({ items: [2] })).toEqual([2]);
    expect(normalizeList({ requests: [3] })).toEqual([3]);
  });

  it("returns an empty array for unknown shapes and nulls", () => {
    expect(normalizeList({ message: "nope" })).toEqual([]);
    expect(normalizeList(null)).toEqual([]);
    expect(normalizeList(undefined)).toEqual([]);
  });
});
