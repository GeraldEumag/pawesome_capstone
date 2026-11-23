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

  it("communicates server-generated SKU and required sellable barcode behavior", () => {
    render(<AddProductModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByPlaceholderText("Leave blank to generate automatically")).toBeInTheDocument();
    expect(screen.getByText(
      "Required for new sellable products. Enter a unique barcode or scan it with the camera."
    )).toBeInTheDocument();
    expect(inventoryApi.createItem).not.toHaveBeenCalled();
  });
});
