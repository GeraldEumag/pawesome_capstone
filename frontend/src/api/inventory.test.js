import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  apiRequest: vi.fn(async () => ({ success: true })),
  normalizeList: (v) => (Array.isArray(v) ? v : []),
}));

import { apiRequest } from "./client";
import { inventoryApi } from "./inventory";

describe("inventoryApi.adjustBatchStock", () => {
  it("targets the real PUT /inventory/batches/{id} endpoint (F-06)", async () => {
    await inventoryApi.adjustBatchStock(7, 5, "Damaged units");

    expect(apiRequest).toHaveBeenCalledWith(
      "/inventory/batches/7",
      expect.objectContaining({ method: "PUT" })
    );
    const body = JSON.parse(apiRequest.mock.calls[0][1].body);
    expect(body).toEqual({ quantity: 5, reason: "Damaged units" });
  });
});
