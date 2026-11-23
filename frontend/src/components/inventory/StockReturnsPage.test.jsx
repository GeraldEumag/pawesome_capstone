import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StockReturnsPage from "./StockReturnsPage";
import { inventoryApi } from "../../api/inventory.jsx";

vi.mock("../../api/inventory.jsx", () => ({
  inventoryApi: {
    getReturns: vi.fn(),
    createReturn: vi.fn(),
    submitReturnDisposition: vi.fn(),
  },
}));

vi.mock("../../utils/alert.jsx", () => ({ showError: vi.fn() }));
vi.mock("../shared/Modal", () => ({
  default: ({ isOpen = true, children, footer }) =>
    isOpen ? <div role="dialog">{children}{footer}</div> : null,
}));
vi.mock("../shared/StatusBadge", () => ({ default: ({ children }) => <span>{children}</span> }));
vi.mock("../shared/PremiumToast", () => ({ default: () => null }));
vi.mock("./QuickItemSelector", () => ({
  default: ({ onSelect }) => (
    <button
      type="button"
      onClick={() => onSelect({ id: 7, name: "Test Shampoo", sku: "SH-7", stock: 4 })}
    >
      Select test item
    </button>
  ),
}));
vi.mock("./EvidencePhoto", () => ({
  EvidenceUpload: () => null,
  EvidenceImage: () => null,
}));

describe("StockReturnsPage idempotency", () => {
  beforeEach(() => {
    inventoryApi.getReturns.mockResolvedValue({
      returns: [],
      meta: { current_page: 1, last_page: 1, total: 0 },
    });
    inventoryApi.createReturn.mockReset();
    inventoryApi.submitReturnDisposition.mockReset();
  });

  it("reuses a key after an uncertain create failure and rotates it after a deterministic 4xx", async () => {
    const user = userEvent.setup();
    const validationError = new Error("Return validation failed");
    validationError.status = 422;
    inventoryApi.createReturn
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockRejectedValueOnce(validationError)
      .mockResolvedValueOnce({ success: true });

    render(<StockReturnsPage />);
    await user.click(screen.getAllByRole("button", { name: /Record Return/ })[0]);
    await user.click(screen.getByRole("button", { name: "Select test item" }));
    await user.type(screen.getByPlaceholderText("Why is the customer returning this item?"), "Damaged package");

    const submit = () => screen.getAllByRole("button", { name: "Record Return" }).at(-1);
    await user.click(submit());
    await waitFor(() => expect(inventoryApi.createReturn).toHaveBeenCalledTimes(1));
    await user.click(submit());
    await waitFor(() => expect(inventoryApi.createReturn).toHaveBeenCalledTimes(2));
    await user.click(submit());
    await waitFor(() => expect(inventoryApi.createReturn).toHaveBeenCalledTimes(3));

    const keys = inventoryApi.createReturn.mock.calls.map(([, options]) =>
      options.headers["Idempotency-Key"]
    );
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  }, 15000);
});
