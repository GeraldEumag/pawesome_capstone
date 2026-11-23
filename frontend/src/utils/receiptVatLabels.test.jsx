import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReceiptDocument from "../components/shared/receipt/ReceiptDocument";
import { buildEscPos } from "./escpos";
import { createReceiptPdf } from "./receiptPdf";
import { buildReceiptHtml } from "./receiptPrinter";

const receipt = {
  title: "Sales Invoice",
  receiptNumber: "REC-VAT-1",
  subtotal: 120,
  netAmount: 107.14,
  vat: 12.86,
  total: 120,
};

describe("VAT-inclusive receipt totals", () => {
  it("labels the on-screen total and VAT component as included", () => {
    render(<ReceiptDocument {...receipt} />);

    expect(screen.getByText("TOTAL (VAT INCLUDED)")).toBeInTheDocument();
    expect(screen.getByText("VAT 12% (included)")).toBeInTheDocument();
    expect(screen.getByText("Net amount (ex-VAT)")).toBeInTheDocument();
  });

  it("uses the inclusive labels on thermal receipt output", () => {
    const raw = buildEscPos(receipt);
    const html = buildReceiptHtml(receipt);

    expect(raw).toContain("TOTAL (VAT INCLUDED)");
    expect(raw).toContain("VAT 12% (included)");
    expect(raw).toContain("Net amount (ex-VAT)");
    expect(html).toContain("TOTAL (VAT INCLUDED)");
    expect(html).toContain("VAT 12% (included)");
    expect(html).toContain("Net amount (ex-VAT)");
  });

  it("labels the total in the generated PDF", async () => {
    const { doc } = await createReceiptPdf(receipt);
    expect(doc.internal.pages[1].join("")).toContain("VAT INCLUDED");
  });

  it("derives a missing net amount from the supplied gross total and VAT portion", () => {
    const raw = buildEscPos({ ...receipt, netAmount: undefined });
    expect(raw).toContain("107.14");
  });
});
