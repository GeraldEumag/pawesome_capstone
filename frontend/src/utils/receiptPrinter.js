/**
 * Shared receipt printing utility.
 *
 * Opens a clean browser window with a properly formatted, printable receipt.
 * Used by all cashier, customer, and payment-verification receipt flows
 * to ensure consistent store info, VAT breakdown, and print behavior.
 *
 * Usage:
 *   import { printReceipt } from "../../utils/receiptPrinter";
 *   printReceipt({ receiptNumber, date, cashier, customer, items, ... });
 */
import { STORE_INFO, computeVatBreakdown } from "./storeInfo";

/**
 * Opens a print window with a formatted receipt and auto-triggers print.
 *
 * @param {Object} opts
 * @param {string} opts.title         - Receipt title (e.g. "Official Cashier Receipt")
 * @param {string} opts.receiptNumber - Receipt or transaction number
 * @param {string} opts.date          - Formatted date string
 * @param {string} [opts.cashier]     - Cashier name
 * @param {string} [opts.customer]    - Customer name
 * @param {string} [opts.paymentMethod] - Payment method (cash, gcash, etc.)
 * @param {string} [opts.paymentStatus] - Payment status (paid, pending)
 * @param {string} [opts.referenceNumber] - Payment reference number
 * @param {Array}  opts.items         - [{ name, quantity, unitPrice, total }]
 * @param {number} opts.subtotal      - VAT-inclusive subtotal
 * @param {number} opts.vat           - VAT amount (if already computed)
 * @param {number} opts.discount      - Discount amount
 * @param {number} opts.total         - Grand total
 * @param {number} [opts.amountReceived] - Cash received
 * @param {number} [opts.change]      - Change amount
 * @param {string} [opts.verifiedBy]  - Who verified the payment
 * @param {string} [opts.footerText]  - Custom footer text
 */
export function printReceipt(opts = {}) {
  const {
    title = "Official Receipt",
    receiptNumber = "",
    date = new Date().toLocaleString("en-PH"),
    cashier = "",
    customer = "Walk-in",
    paymentMethod = "cash",
    paymentStatus = "paid",
    referenceNumber = "",
    items = [],
    subtotal = 0,
    vat,
    discount = 0,
    total = 0,
    amountReceived,
    change,
    verifiedBy = "",
    footerText = "Thank you for choosing Pawesome Retreat Inc.!",
  } = opts;

  // Compute VAT if not provided
  const vatBreakdown = computeVatBreakdown(total);
  const vatAmount = vat != null ? Number(vat) : vatBreakdown.vatAmount;

  const itemsHtml = items
    .map((item) => {
      const name = item.name || item.item_name || "Item";
      const qty = item.quantity || 1;
      const unitPrice = Number(item.unitPrice || item.unit_price || 0);
      const itemTotal = Number(item.total || item.total_price || unitPrice * qty);
      return `<tr>
        <td>${escapeHtml(name)}<br><small>${qty} × ${formatPhp(unitPrice)}</small></td>
        <td style="text-align:right">${formatPhp(itemTotal)}</td>
      </tr>`;
    })
    .join("");

  const metaRows = [
    `<tr><td>Receipt #</td><td style="text-align:right">${escapeHtml(receiptNumber)}</td></tr>`,
    cashier ? `<tr><td>Cashier</td><td style="text-align:right">${escapeHtml(cashier)}</td></tr>` : "",
    `<tr><td>Customer</td><td style="text-align:right">${escapeHtml(customer)}</td></tr>`,
    `<tr><td>Payment</td><td style="text-align:right">${escapeHtml(paymentMethod)}</td></tr>`,
    `<tr><td>Status</td><td style="text-align:right">${escapeHtml(paymentStatus)}</td></tr>`,
    referenceNumber ? `<tr><td>Reference</td><td style="text-align:right">${escapeHtml(referenceNumber)}</td></tr>` : "",
    verifiedBy ? `<tr><td>Verified By</td><td style="text-align:right">${escapeHtml(verifiedBy)}</td></tr>` : "",
  ].filter(Boolean).join("");

  const totalsRows = [
    `<tr><td>Subtotal (incl. VAT)</td><td style="text-align:right">${formatPhp(subtotal)}</td></tr>`,
    `<tr><td>VAT 12%</td><td style="text-align:right">${formatPhp(vatAmount)}</td></tr>`,
    discount > 0 ? `<tr><td>Discount</td><td style="text-align:right">-${formatPhp(discount)}</td></tr>` : "",
    `<tr class="total-row"><td>TOTAL</td><td style="text-align:right">${formatPhp(total)}</td></tr>`,
    amountReceived != null ? `<tr><td>Received</td><td style="text-align:right">${formatPhp(amountReceived)}</td></tr>` : "",
    change != null ? `<tr><td>Change</td><td style="text-align:right">${formatPhp(change)}</td></tr>` : "",
  ].filter(Boolean).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} ${escapeHtml(receiptNumber)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', 'Consolas', monospace;
      padding: 20px;
      max-width: 380px;
      margin: 0 auto;
      color: #111827;
      background: #fff;
    }
    .store-name { text-align: center; font-size: 18px; font-weight: 700; margin-bottom: 2px; }
    .store-address { text-align: center; font-size: 11px; color: #555; margin-bottom: 2px; }
    .store-contact { text-align: center; font-size: 11px; color: #555; margin-bottom: 8px; }
    .receipt-title { text-align: center; font-size: 13px; font-weight: 600; margin-bottom: 4px; text-transform: uppercase; }
    .receipt-date { text-align: center; font-size: 11px; color: #666; margin-bottom: 12px; }
    hr { border: none; border-top: 1px dashed #ccc; margin: 10px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    td { padding: 3px 0; vertical-align: top; }
    .total-row td { font-size: 14px; font-weight: 700; padding-top: 8px; border-top: 1px dashed #ccc; }
    .footer { text-align: center; font-size: 11px; color: #888; margin-top: 16px; line-height: 1.5; }
    .print-btn {
      display: block; width: 100%; padding: 12px; margin-top: 20px;
      font-size: 14px; font-weight: 600; cursor: pointer;
      background: #ec4899; color: #fff; border: none; border-radius: 6px;
    }
    @media print {
      .print-btn { display: none !important; }
      body { padding: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="store-name">${escapeHtml(STORE_INFO.name)}</div>
  <div class="store-address">${escapeHtml(STORE_INFO.address)}</div>
  <div class="store-contact">${escapeHtml(STORE_INFO.email)}</div>
  <hr>
  <div class="receipt-title">${escapeHtml(title)}</div>
  <div class="receipt-date">${escapeHtml(date)}</div>
  <hr>
  <table>${metaRows}</table>
  <hr>
  <table>${itemsHtml}</table>
  <hr>
  <table>${totalsRows}</table>
  <div class="footer">${escapeHtml(footerText)}<br>Please keep this receipt for your records.</div>
  <button class="print-btn" onclick="window.print()">Print Receipt</button>
</body>
</html>`;

  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) {
    alert("Please allow pop-ups to print the receipt.");
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  // Auto-trigger print after a brief delay to ensure rendering
  setTimeout(() => {
    try { w.print(); } catch (e) { /* user can click Print button */ }
  }, 300);
}

// ── Helpers ──────────────────────────────────────────────

function formatPhp(value) {
  const n = Number(value) || 0;
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
