import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StatusBadge from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders its children with the requested variant", () => {
    render(<StatusBadge variant="success">In Stock</StatusBadge>);
    const badge = screen.getByText("In Stock");
    expect(badge).toHaveClass("pw-badge", "pw-badge--success");
  });

  it("falls back to neutral for an unknown variant", () => {
    render(<StatusBadge variant="bogus">Unknown</StatusBadge>);
    expect(screen.getByText("Unknown")).toHaveClass("pw-badge--neutral");
  });
});
