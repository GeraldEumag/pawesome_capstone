import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Modal from "./Modal";

afterEach(cleanup);

describe("Modal", () => {
  it("renders title, body, and footer through a portal when open", () => {
    render(
      <Modal isOpen onClose={() => {}} title="Confirm booking" footer={<button>Save</button>}>
        <p>Body content</p>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body.contains(dialog)).toBe(true); // portaled to body
    expect(screen.getByText("Confirm booking")).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(
      <Modal isOpen={false} onClose={() => {}} title="Hidden">
        secret
      </Modal>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });

  it("calls onClose from the close button", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Dialog">
        x
      </Modal>
    );
    fireEvent.click(screen.getByRole("button", { name: "Close Dialog dialog" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Dialog">
        x
      </Modal>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop mousedown only when closeOnBackdrop is true", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <Modal isOpen onClose={onClose} title="Dialog">
        x
      </Modal>
    );
    fireEvent.mouseDown(document.querySelector(".pw-modal-overlay"));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    const onClose2 = vi.fn();
    render(
      <Modal isOpen onClose={onClose2} title="Dialog" closeOnBackdrop={false}>
        x
      </Modal>
    );
    fireEvent.mouseDown(document.querySelector(".pw-modal-overlay"));
    expect(onClose2).not.toHaveBeenCalled();
  });

  it("does not close when clicking inside the dialog", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Dialog">
        <button>Inside</button>
      </Modal>
    );
    fireEvent.mouseDown(screen.getByRole("button", { name: "Inside" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("locks body scroll while open and restores it on unmount", () => {
    const { unmount } = render(
      <Modal isOpen onClose={() => {}} title="Dialog">
        x
      </Modal>
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("hides the close button when showClose is false", () => {
    render(
      <Modal isOpen onClose={() => {}} title="Dialog" showClose={false}>
        x
      </Modal>
    );
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
  });
});
