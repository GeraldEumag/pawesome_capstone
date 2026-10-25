import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaw } from "@fortawesome/free-solid-svg-icons";
import { STORE_INFO } from "../../../utils/storeInfo";
import { formatCurrency } from "../../../utils/currency";
import brandLogo from "../../../assets/pawesome.jpg";
import "./ReceiptDocument.css";

const money = (v) => formatCurrency(Number(v) || 0);

const STATUS_VARIANT = {
  paid: "success",
  completed: "success",
  verified: "success",
  pending: "warning",
  cancelled: "danger",
  void: "danger",
  failed: "danger",
  refunded: "info",
};

/**
 * Branded on-screen receipt — the online counterpart of the A4 invoice PDF.
 * Props mirror the downloadReceiptPdf/printReceipt options shape so every
 * caller can pass the same options object it already builds.
 */
const ReceiptDocument = ({
  title = "Sales Invoice",
  receiptNumber = "",
  date = "",
  cashier = "",
  customer = "Walk-in",
  paymentMethod = "",
  paymentStatus = "",
  referenceNumber = "",
  verifiedBy = "",
  metaRows = [],
  items = [],
  subtotal = 0,
  netAmount,
  vat,
  discount = 0,
  total = 0,
  amountReceived,
  change,
  footerText = "Thank you for choosing Pawesome Retreat Inc.!",
}) => {
  const statusKey = String(paymentStatus || "").toLowerCase();
  const statusVariant = STATUS_VARIANT[statusKey] || "neutral";
  const meta = [
    ["Receipt #", receiptNumber],
    ["Date", date],
    ["Cashier", cashier],
    ["Customer", customer],
    ["Payment", paymentMethod && String(paymentMethod).toUpperCase()],
    ["Reference #", referenceNumber],
    ["Verified by", verifiedBy],
    ...metaRows.map((r) => [r.label, r.value]),
  ].filter(([, v]) => v !== null && v !== undefined && v !== "");

  return (
    <div className="rcd-doc" id="receipt-content">
      {/* ── Brand header ── */}
      <div className="rcd-header">
        <img src={brandLogo} alt="Pawesome logo" className="rcd-logo" />
        <div className="rcd-brand">
          <div className="rcd-store-name">{STORE_INFO.name.toUpperCase()}</div>
          <div className="rcd-store-line">{STORE_INFO.address.replace(/\n/g, ", ")}</div>
          <div className="rcd-store-line">{STORE_INFO.email} · {STORE_INFO.phone}</div>
        </div>
        <div className="rcd-title-block">
          <div className="rcd-title">{title}</div>
          {paymentStatus && (
            <span className={`rcd-status rcd-status--${statusVariant}`}>
              {String(paymentStatus).toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* ── Meta grid ── */}
      <div className="rcd-meta">
        {meta.map(([label, value]) => (
          <div className="rcd-meta-item" key={label}>
            <span className="rcd-meta-label">{label}</span>
            <span className="rcd-meta-value">{value}</span>
          </div>
        ))}
      </div>

      {/* ── Items table ── */}
      {items.length > 0 && (
        <table className="rcd-items">
          <thead>
            <tr>
              <th className="rcd-th rcd-th--name">Item</th>
              <th className="rcd-th rcd-th--qty">Qty</th>
              <th className="rcd-th rcd-th--price">Unit Price</th>
              <th className="rcd-th rcd-th--total">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const qty = item.quantity ?? item.qty ?? 1;
              const unit = Number(item.unitPrice ?? item.unit_price ?? item.price) || 0;
              const line = Number(item.total ?? item.total_price ?? unit * qty) || 0;
              return (
                <tr key={idx}>
                  <td className="rcd-td rcd-td--name">{item.name ?? item.item_name ?? "Item"}</td>
                  <td className="rcd-td rcd-td--qty">{qty}</td>
                  <td className="rcd-td rcd-td--price">{money(unit)}</td>
                  <td className="rcd-td rcd-td--total">{money(line)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* ── Totals ── */}
      <div className="rcd-totals">
        <div className="rcd-total-row">
          <span>{netAmount == null ? "Subtotal" : "Net Amount (ex-VAT)"}</span>
          <span>{money(netAmount ?? subtotal)}</span>
        </div>
        {vat !== null && vat !== undefined && (
          <div className="rcd-total-row">
            <span>VAT 12%</span>
            <span>{money(Math.abs(Number(vat) || 0))}</span>
          </div>
        )}
        {Number(discount) > 0 && (
          <div className="rcd-total-row">
            <span>Discount</span>
            <span>-{money(discount)}</span>
          </div>
        )}
        <div className="rcd-total-row rcd-total-row--grand">
          <span>TOTAL</span>
          <span>{money(total)}</span>
        </div>
      </div>

      {/* ── Payment details ── */}
      {(amountReceived != null || change != null) && (
        <div className="rcd-payment">
          {amountReceived != null && (
            <div className="rcd-total-row"><span>Cash Received</span><span>{money(amountReceived)}</span></div>
          )}
          {change != null && (
            <div className="rcd-total-row"><span>Change</span><span>{money(change)}</span></div>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="rcd-footer">
        <FontAwesomeIcon icon={faPaw} className="rcd-footer-icon" />
        <p className="rcd-footer-text">{footerText}</p>
        <p className="rcd-footer-tagline">{STORE_INFO.tagline}</p>
      </div>
    </div>
  );
};

export default ReceiptDocument;
