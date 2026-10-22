import jsPDF from "jspdf";
import { STORE_INFO } from "./storeInfo";
import brandLogoUrl from "../assets/pawesome.jpg";

const PAGE_WIDTH = 58;
const PAGE_HEIGHT = 200;
const LEFT = 4;
const RIGHT = PAGE_WIDTH - 4;
const CONTENT_WIDTH = RIGHT - LEFT;
const BOTTOM = PAGE_HEIGHT - 8;

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
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: [PAGE_WIDTH, PAGE_HEIGHT], compress: true });
  const receiptLabel = cleanText(receiptNumber, "N/A");
  const pdfTitle = cleanText(title, "Invoice");
  let y = 5;

  doc.setProperties({
    title: `${pdfTitle} ${receiptLabel}`,
    subject: "Payment receipt",
    creator: STORE_INFO.name,
  });

  const addContinuationHeader = () => {
    doc.addPage([PAGE_WIDTH, PAGE_HEIGHT], "p");
    let logoHeight = 0;
    if (brandLogo) {
      const image = doc.getImageProperties(brandLogo);
      const scale = Math.min(10 / image.width, 8 / image.height);
      const logoWidth = image.width * scale;
      logoHeight = image.height * scale;
      doc.addImage(brandLogo, "JPEG", (PAGE_WIDTH - logoWidth) / 2, 5, logoWidth, logoHeight);
    }
    y = 6 + logoHeight;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(31, 41, 55);
    doc.text(`${pdfTitle.toUpperCase()} - CONTINUED`, LEFT, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`Receipt #: ${receiptLabel}`, LEFT, y);
    y += 5;
    doc.setDrawColor(203, 213, 225);
    doc.line(LEFT, y, RIGHT, y);
    y += 4;
  };

  const ensureSpace = (height) => {
    if (y + height > BOTTOM) addContinuationHeader();
  };

  const centerText = (value, fontSize, style = "normal", lineHeight = 4) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(cleanText(value, ""), CONTENT_WIDTH);
    if (!lines.length || !lines[0]) return;
    ensureSpace(lines.length * lineHeight);
    doc.setFont("helvetica", style);
    doc.setFontSize(fontSize);
    doc.setTextColor(31, 41, 55);
    doc.text(lines, PAGE_WIDTH / 2, y, { align: "center" });
    y += lines.length * lineHeight;
  };

  const drawRule = () => {
    ensureSpace(3);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(LEFT, y, RIGHT, y);
    y += 3;
  };

  const drawRow = (label, value) => {
    if (value === null || value === undefined || value === "") return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const leftLines = doc.splitTextToSize(cleanText(label, ""), 21);
    const rightLines = doc.splitTextToSize(cleanText(value, ""), CONTENT_WIDTH - 22);
    const rowHeight = Math.max(leftLines.length, rightLines.length, 1) * 3.6;
    ensureSpace(rowHeight);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(55, 65, 81);
    doc.text(leftLines, LEFT, y);
    doc.setFont("helvetica", "bold");
    doc.text(rightLines, RIGHT, y, { align: "right" });
    y += rowHeight + 0.6;
  };

  if (brandLogo) {
    const logoProperties = doc.getImageProperties(brandLogo);
    const logoScale = Math.min(18 / logoProperties.width, 14 / logoProperties.height);
    const logoWidth = logoProperties.width * logoScale;
    const logoHeight = logoProperties.height * logoScale;
    doc.addImage(brandLogo, "JPEG", (PAGE_WIDTH - logoWidth) / 2, y, logoWidth, logoHeight);
    y += logoHeight + 1.5;
  }
  centerText(STORE_INFO.name.toUpperCase(), 10, "bold", 4.5);
  centerText(STORE_INFO.address.replace(/\n/g, ", "), 7, "normal", 3.3);
  centerText(`${STORE_INFO.email} | ${STORE_INFO.phone}`, 6.5, "normal", 3.2);
  centerText(pdfTitle.toUpperCase(), 9, "bold", 4);
  y += 1;
  drawRule();

  drawRow("Receipt #", receiptLabel);
  drawRow("Date", date);
  drawRow("Cashier", cashier);
  drawRow("Customer", customer);
  drawRow("Payment", cleanText(paymentMethod).toUpperCase());
  drawRow("Status", cleanText(paymentStatus).toUpperCase());
  drawRow("Reference #", referenceNumber);
  drawRow("Verified by", verifiedBy);

  if (Array.isArray(items) && items.length > 0) {
    drawRule();
    items.forEach((item) => {
      const quantity = item.quantity ?? item.qty ?? 1;
      const unitPrice = safeAmount(item.unitPrice ?? item.unit_price ?? item.price);
      const itemTotal = safeAmount(item.total ?? item.total_price ?? unitPrice * safeAmount(quantity));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      const nameLines = doc.splitTextToSize(cleanText(item.name ?? item.item_name, "Item"), CONTENT_WIDTH);
      ensureSpace(nameLines.length * 3.6 + 8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(31, 41, 55);
      doc.text(nameLines, LEFT, y);
      y += nameLines.length * 3.6;
      drawRow(`${quantity} x ${formatAmount(unitPrice)}`, formatAmount(itemTotal));
    });
  }

  drawRule();
  drawRow(netAmount == null ? "Subtotal" : "Net Amount (ex-VAT)", formatAmount(netAmount ?? subtotal));
  if (vat !== null && vat !== undefined) drawRow("VAT 12%", formatAmount(Math.abs(safeAmount(vat))));
  if (safeAmount(discount) > 0) drawRow("Discount", `-${formatAmount(discount)}`);
  drawRule();
  ensureSpace(9);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text("TOTAL", LEFT, y);
  doc.text(formatAmount(total), RIGHT, y, { align: "right" });
  y += 7;
  drawRow("Cash received", amountReceived == null ? "" : formatAmount(amountReceived));
  drawRow("Change", change == null ? "" : formatAmount(change));

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const footerLines = doc.splitTextToSize(cleanText(footerText, ""), CONTENT_WIDTH);
  ensureSpace(footerLines.length * 3.5 + 6);
  y += 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(75, 85, 99);
  doc.text(footerLines, PAGE_WIDTH / 2, y, { align: "center" });

  const filenameBase = safeFilename(`receipt-${receiptLabel || opts.id || "transaction"}`);
  return { doc, filename: `${filenameBase}.pdf` };
};

export const downloadReceiptPdf = async (opts = {}) => {
  const { doc, filename } = await createReceiptPdf(opts);
  doc.save(filename);
  return doc;
};
