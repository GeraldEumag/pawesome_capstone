import jsPDF from "jspdf";
import { STORE_INFO } from "./storeInfo";
import brandLogoUrl from "../assets/pawesome.jpg";

/* A4 branded invoice. Same exports + opts contract as before so every
   caller (POS, transactions, history, customer payments, vet, verification)
   gets the new layout without changes. Thermal printing lives elsewhere. */

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;
const RIGHT = PAGE_W - M;
const CONTENT_W = RIGHT - M;
const BOTTOM = PAGE_H - 22;

const BRAND = { r: 255, g: 95, b: 147 };
const BRAND_SOFT = { r: 255, g: 200, b: 221 };
const BRAND_TINT = { r: 255, g: 247, b: 251 };
const INK = { r: 31, g: 41, b: 55 };
const MUTED = { r: 100, g: 116, b: 139 };
const LINE = { r: 226, g: 232, b: 240 };
const STATUS_COLOR = {
  paid: { r: 22, g: 163, b: 74 },
  completed: { r: 22, g: 163, b: 74 },
  verified: { r: 22, g: 163, b: 74 },
  pending: { r: 217, g: 119, b: 6 },
  cancelled: { r: 220, g: 38, b: 38 },
  void: { r: 220, g: 38, b: 38 },
  failed: { r: 220, g: 38, b: 38 },
  refunded: { r: 37, g: 99, b: 235 },
};

const cleanText = (value, fallback = "-") => {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value).replace(/[\t\r\n]+/g, " ").trim();
};

const safeAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const formatAmount = (value) => `PHP ${safeAmount(value).toLocaleString("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const safeFilename = (value) => cleanText(value, "receipt")
  .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
  .replace(/\s+/g, "-")
  .slice(0, 90);

const loadBrandLogo = async () => {
  try {
    const response = await fetch(brandLogoUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const setColor = (doc, c) => doc.setTextColor(c.r, c.g, c.b);
const fill = (doc, c) => doc.setFillColor(c.r, c.g, c.b);
const stroke = (doc, c) => doc.setDrawColor(c.r, c.g, c.b);

export const createReceiptPdf = async (opts = {}) => {
  const {
    title = "Invoice",
    receiptNumber = opts.id || "",
    date = new Date().toLocaleString("en-PH"),
    cashier = "",
    customer = "Walk-in",
    paymentMethod = "cash",
    paymentStatus = "paid",
    referenceNumber = "",
    items = [],
    subtotal = 0,
    netAmount,
    vat,
    discount = 0,
    total = 0,
    amountReceived,
    change,
    verifiedBy = "",
    footerText = "Thank you for choosing Pawesome Retreat Inc.!",
  } = opts;

  const brandLogo = await loadBrandLogo();
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
  const receiptLabel = cleanText(receiptNumber, "N/A");
  const pdfTitle = cleanText(title, "Invoice");
  const statusKey = cleanText(paymentStatus, "").toLowerCase();
  let y = 0;

  doc.setProperties({
    title: `${pdfTitle} ${receiptLabel}`,
    subject: "Payment receipt",
    creator: STORE_INFO.name,
  });

  const drawLogo = (x, yy, size) => {
    if (!brandLogo) return;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, yy, size, size, size * 0.14, size * 0.14, "F");
    doc.addImage(brandLogo, "JPEG", x, yy, size, size);
  };

  const drawBrandBand = (height) => {
    fill(doc, BRAND);
    doc.rect(0, 0, PAGE_W, height, "F");
  };

  const drawFirstHeader = () => {
    drawBrandBand(44);
    drawLogo(M, 9, 26);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text(STORE_INFO.name.toUpperCase(), M + 32, 17);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(cleanText(STORE_INFO.address.replace(/\n/g, ", "), ""), M + 32, 23, { maxWidth: 100 });
    doc.text(cleanText(`${STORE_INFO.email}  |  ${STORE_INFO.phone}`, ""), M + 32, 29);
    doc.text(cleanText(STORE_INFO.tagline, ""), M + 32, 35);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(pdfTitle.toUpperCase(), RIGHT, 18, { align: "right" });

    if (statusKey) {
      const label = statusKey.toUpperCase();
      const badgeW = Math.max(26, doc.getTextWidth(label) + 10);
      const sc = STATUS_COLOR[statusKey] || { r: 255, g: 255, b: 255 };
      fill(doc, sc);
      doc.roundedRect(RIGHT - badgeW, 24, badgeW, 7, 3.5, 3.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text(label, RIGHT - badgeW / 2, 28.6, { align: "center" });
    }
    y = 54;
  };

  const drawContinuationHeader = () => {
    doc.addPage("a4", "p");
    drawBrandBand(16);
    drawLogo(M, 3, 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`${pdfTitle.toUpperCase()} — CONTINUED`, M + 14, 9.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Receipt #${receiptLabel}`, RIGHT, 9.5, { align: "right" });
    y = 26;
  };

  const ensureSpace = (height) => {
    if (y + height > BOTTOM) drawContinuationHeader();
  };

  const drawSectionLabel = (text, x, yy) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    setColor(doc, MUTED);
    doc.text(text.toUpperCase(), x, yy);
  };

  const drawKeyValue = (label, value, x, yy, width, valueSize = 9) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setColor(doc, MUTED);
    doc.text(label.toUpperCase(), x, yy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(valueSize);
    setColor(doc, INK);
    const lines = doc.splitTextToSize(cleanText(value, "—"), width);
    doc.text(lines, x, yy + 4.5);
    return lines.length;
  };

  const drawFirstHeaderBody = () => {
    if (!y) y = 54;
    const cardTop = y;
    const cardH = 36;
    fill(doc, BRAND_TINT);
    stroke(doc, LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, cardTop, CONTENT_W, cardH, 2.5, 2.5, "FD");

    drawSectionLabel("Billed to", M + 5, cardTop + 7);
    drawKeyValue("", cleanText(customer, "Walk-in"), M + 5, cardTop + 9, 80, 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setColor(doc, MUTED);

    const metaPairs = [
      ["Receipt #", receiptLabel],
      ["Date", date],
      ["Cashier", cashier],
      ["Payment", cleanText(paymentMethod, "").toUpperCase()],
      ["Reference #", referenceNumber],
      ["Verified by", verifiedBy],
    ].filter(([, v]) => v !== null && v !== undefined && v !== "");

    const colX = [M + 98, M + 146];
    metaPairs.forEach(([label, value], i) => {
      const col = Math.floor(i / 3);
      const row = i % 3;
      const xx = colX[col];
      const yy = cardTop + 7 + row * 9.5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      setColor(doc, MUTED);
      doc.text(label.toUpperCase(), xx, yy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      setColor(doc, INK);
      doc.text(cleanText(value, "—"), xx, yy + 4, { maxWidth: 46 });
    });

    y = cardTop + cardH + 8;
  };

  const drawItemsTable = () => {
    if (!Array.isArray(items) || items.length === 0) return;
    const cols = { name: M + 4, qty: RIGHT - 78, price: RIGHT - 52, total: RIGHT - 4 };
    const drawHeader = () => {
      ensureSpace(10);
      fill(doc, BRAND_SOFT);
      doc.rect(M, y, CONTENT_W, 7.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      setColor(doc, INK);
      doc.text("ITEM", cols.name, y + 5);
      doc.text("QTY", cols.qty, y + 5, { align: "right" });
      doc.text("UNIT PRICE", cols.price, y + 5, { align: "right" });
      doc.text("TOTAL", cols.total, y + 5, { align: "right" });
      y += 7.5;
    };
    drawHeader();

    items.forEach((item, idx) => {
      const quantity = item.quantity ?? item.qty ?? 1;
      const unitPrice = safeAmount(item.unitPrice ?? item.unit_price ?? item.price);
      const itemTotal = safeAmount(item.total ?? item.total_price ?? unitPrice * safeAmount(quantity));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      const nameLines = doc.splitTextToSize(cleanText(item.name ?? item.item_name, "Item"), 92);
      const rowH = Math.max(nameLines.length * 4.2 + 3, 8);
      if (y + rowH > BOTTOM) {
        drawContinuationHeader();
        drawHeader();
      }
      if (idx % 2 === 1) {
        fill(doc, BRAND_TINT);
        doc.rect(M, y, CONTENT_W, rowH, "F");
      }
      setColor(doc, INK);
      doc.text(nameLines, cols.name, y + 5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(String(quantity), cols.qty, y + 5, { align: "right" });
      doc.text(formatAmount(unitPrice), cols.price, y + 5, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.text(formatAmount(itemTotal), cols.total, y + 5, { align: "right" });
      y += rowH;
      stroke(doc, LINE);
      doc.setLineWidth(0.2);
      doc.line(M, y, RIGHT, y);
    });
    y += 6;
  };

  const drawTotals = () => {
    const rows = [
      [netAmount == null ? "Subtotal" : "Net amount (ex-VAT)", formatAmount(netAmount ?? subtotal)],
    ];
    if (vat !== null && vat !== undefined) rows.push(["VAT 12%", formatAmount(Math.abs(safeAmount(vat)))]);
    if (safeAmount(discount) > 0) rows.push(["Discount", `-${formatAmount(discount)}`]);

    const boxW = 84;
    const boxX = RIGHT - boxW;
    const rowH = 6.5;
    ensureSpace(rows.length * rowH + 30);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    rows.forEach(([label, value]) => {
      setColor(doc, MUTED);
      doc.text(label, boxX + 2, y + 4.5);
      setColor(doc, INK);
      doc.setFont("helvetica", "bold");
      doc.text(value, RIGHT - 2, y + 4.5, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += rowH;
    });

    y += 2;
    fill(doc, BRAND);
    doc.roundedRect(boxX, y, boxW, 11, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text("TOTAL", boxX + 4, y + 7.2);
    doc.setFontSize(11);
    doc.text(formatAmount(total), RIGHT - 4, y + 7.2, { align: "right" });
    y += 15;

    if (amountReceived != null) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      setColor(doc, MUTED);
      doc.text("Cash received", boxX + 2, y);
      setColor(doc, INK);
      doc.setFont("helvetica", "bold");
      doc.text(formatAmount(amountReceived), RIGHT - 2, y, { align: "right" });
      y += 6;
    }
    if (change != null) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      setColor(doc, MUTED);
      doc.text("Change", boxX + 2, y);
      setColor(doc, INK);
      doc.setFont("helvetica", "bold");
      doc.text(formatAmount(change), RIGHT - 2, y, { align: "right" });
      y += 6;
    }
    y += 6;
  };

  const drawFooter = () => {
    const lines = doc.splitTextToSize(cleanText(footerText, ""), CONTENT_W - 20);
    ensureSpace(lines.length * 5 + 16);
    stroke(doc, BRAND_SOFT);
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.line(M, y, RIGHT, y);
    doc.setLineDashPattern([], 0);
    y += 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setColor(doc, INK);
    doc.text(lines, PAGE_W / 2, y, { align: "center" });
    y += lines.length * 4.5 + 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setColor(doc, MUTED);
    doc.text(cleanText(STORE_INFO.tagline, ""), PAGE_W / 2, y, { align: "center" });
  };

  drawFirstHeader();
  drawFirstHeaderBody();
  drawItemsTable();
  drawTotals();
  drawFooter();

  const filenameBase = safeFilename(`receipt-${receiptLabel || opts.id || "transaction"}`);
  return { doc, filename: `${filenameBase}.pdf` };
};

export const downloadReceiptPdf = async (opts = {}) => {
  const { doc, filename } = await createReceiptPdf(opts);
  doc.save(filename);
  return doc;
};
