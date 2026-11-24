import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AddProductModal from "./AddProductModal";
import { inventoryApi } from "../../api/inventory.jsx";

vi.mock("../../api/inventory.jsx", () => ({
  inventoryApi: {
    getSuppliers: vi.fn(),
    createItem: vi.fn(),
  },
}));

describe("AddProductModal inventory identity fields", () => {
  beforeEach(() => {
    inventoryApi.getSuppliers.mockResolvedValue({ suppliers: [] });
    inventoryApi.createItem.mockReset();
  });

  it("communicates server-generated SKU and auto-generated barcode behavior", () => {
    render(<AddProductModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByPlaceholderText("Leave blank to generate automatically")).toBeInTheDocument();
    expect(screen.getByText(
      "Optional — leave blank to auto-generate a unique barcode, or scan/type your own."
    )).toBeInTheDocument();
    expect(inventoryApi.createItem).not.toHaveBeenCalled();
  });
});
