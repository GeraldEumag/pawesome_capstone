import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faTrash, faCheck } from "@fortawesome/free-solid-svg-icons";
import { inventoryApi } from "../../api/inventory.jsx";
import { showError } from "../../utils/alert.jsx";
import Modal from "../shared/Modal";
import DatePickerInput from "../shared/DatePickerInput";
import PremiumToast from "../shared/PremiumToast";
import QuickItemSelector from "./QuickItemSelector";
import { uomOptionsFor, uomMultiplier, formatUomHint } from "./uom";
import "./StockMovement.css";

const STOCK_IN_TYPES = [
  { value: "purchase", label: "New Purchase" },
  { value: "supplier_delivery", label: "Supplier Delivery" },
  { value: "customer_return", label: "Customer Return (Approved Restock)" },
  { value: "return_from_internal", label: "Return from Internal Usage" },
  { value: "correction", label: "Inventory Correction" },
  { value: "other", label: "Other Authorized Incoming Stock" },
];

const toDateStr = (d) => {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
};

const newIdemKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `in-${Date.now()}`;

const blankLine = (item) => ({
  item,
  quantity: 1,
  unit: "base",
  unit_cost: "",
  batch_no: "",
  received_date: new Date(),
  manufacturing_date: null,
  expiration_date: null,
});

const StockInPage = () => {
  const [transactionType, setTransactionType] = useState("purchase");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [idemKey, setIdemKey] = useState(newIdemKey());
  const [lastTxn, setLastTxn] = useState(null);
  const [toast, setToast] = useState({ show: false, type: "success", title: "", message: "" });

  const totalUnits = useMemo(
    () => lines.reduce((s, l) => s + (parseInt(l.quantity, 10) || 0) * uomMultiplier(l.item, l.unit), 0),
    [lines]
  );

  const addItem = (item) => setLines((prev) => [...prev, blankLine(item)]);
  const removeLine = (itemId) => setLines((prev) => prev.filter((l) => l.item.id !== itemId));
  const updateLine = (itemId, patch) =>
    setLines((prev) => prev.map((l) => (l.item.id === itemId ? { ...l, ...patch } : l)));

  const validate = () => {
    const errs = {};
    if (transactionType === "other" && !description.trim()) errs.description = "Required for 'Other' stock-in.";
    lines.forEach((l) => {
      const q = parseInt(l.quantity, 10);
      if (!q || q <= 0) errs[`qty_${l.item.id}`] = "Qty must be > 0.";
      if (l.item.requires_expiry_tracking && !l.expiration_date) {
        errs[`exp_${l.item.id}`] = "Expiration required.";
      }
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrors({});
    try {
      const res = await inventoryApi.stockIn(
        {
          transaction_type: transactionType,
          description: description.trim() || null,
          supplier: supplier.trim() || null,
          reference: reference.trim() || null,
          items: lines.map((l) => ({
            inventory_item_id: l.item.id,
            quantity: parseInt(l.quantity, 10),
            unit: l.unit || "base",
            batch_no: l.batch_no.trim() || null,
            received_date: toDateStr(l.received_date),
            manufacturing_date: toDateStr(l.manufacturing_date),
            expiration_date: toDateStr(l.expiration_date),
            supplier: supplier.trim() || null,
            unit_cost: l.unit_cost === "" ? null : parseFloat(l.unit_cost),
          })),
        },
        { headers: { "Idempotency-Key": idemKey } }
      );
      setConfirming(false);
      setLines([]);
      setDescription("");
      setReference("");
      setIdemKey(newIdemKey());
      setLastTxn(res.transaction_no);
      setToast({ show: true, type: "success", title: "Stock In Recorded", message: `Transaction ${res.transaction_no} posted — ${res.lines?.length || 0} item(s) updated.` });
    } catch (err) {
      const apiErrors = err?.response?.errors;
      if (apiErrors && typeof apiErrors === "object") setErrors(apiErrors);
      showError(err.message || "Stock-in failed.", "Stock In");
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sm-page">
      <div className="sm-header">
        <div>
          <h1><FontAwesomeIcon icon={faArrowDown} /> Stock In</h1>
          <div className="sm-subtitle">Receive purchases, deliveries, and approved returns. Every submission posts a linked movement record.</div>
        </div>
      </div>

      {lastTxn && (
        <div className="sm-queued-notice" style={{ background: "var(--color-success-bg, #e8f7ee)", borderColor: "#b7e4c9", color: "var(--color-success-text, #177245)" }}>
          <FontAwesomeIcon icon={faCheck} /> Last transaction posted: <strong>{lastTxn}</strong>
        </div>
      )}

      <div className="sm-card">
        <h3>Transaction Details</h3>
        <div className="sm-form-grid">
          <div className="sm-field">
            <label>Transaction Type *</label>
            <select value={transactionType} onChange={(e) => setTransactionType(e.target.value)}>
              {STOCK_IN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="sm-field">
            <label>Supplier</label>
            <input type="text" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier name" />
          </div>
          <div className="sm-field">
            <label>Reference / Invoice No.</label>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PO, invoice, or delivery ref" />
          </div>
          <div className="sm-field sm-full">
            <label>Description {transactionType === "other" && <span className="sm-error-text">* required</span>}</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Reason or notes for this incoming stock" />
            {errors.description && <span className="sm-error-text">{errors.description}</span>}
          </div>
        </div>
      </div>

      <div className="sm-card">
        <h3>Add Items</h3>
        <QuickItemSelector onSelect={addItem} excludeIds={lines.map((l) => l.item.id)} />

        {lines.length === 0 ? (
          <div className="sm-empty-lines">Search and select items above to build this stock-in transaction. You can add multiple items.</div>
        ) : (
          <div className="sm-table-wrap" style={{ marginTop: "1rem" }}>
            <table className="sm-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Current</th>
                  <th>Qty Received *</th>
                  <th>Unit Cost</th>
                  <th>Batch No.</th>
                  <th>Received</th>
                  <th>Expiration</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.item.id}>
                    <td>
                      <span className="sm-line-item">{l.item.name}</span>
                      <span className="sm-line-sku">{l.item.sku || "—"} · {l.item.unit || "units"}</span>
                    </td>
                    <td>{l.item.stock}</td>
                    <td>
                      <div className="sm-uom-row">
                        <input
                          type="number" min="1" value={l.quantity}
                          onChange={(e) => updateLine(l.item.id, { quantity: e.target.value })}
                        />
                        {uomOptionsFor(l.item).length > 1 && (
                          <select
                            className="sm-uom-select"
                            value={l.unit}
                            onChange={(e) => updateLine(l.item.id, { unit: e.target.value })}
                            title="Unit of measure"
                          >
                            {uomOptionsFor(l.item).map((o) => (
                              <option key={o.unit} value={o.unit}>{o.label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      {formatUomHint(l.item, l.quantity, l.unit) && (
                        <span className="sm-uom-hint">{formatUomHint(l.item, l.quantity, l.unit)}</span>
                      )}
                      {errors[`qty_${l.item.id}`] && <span className="sm-error-text">{errors[`qty_${l.item.id}`]}</span>}
                    </td>
                    <td>
                      <input
                        type="number" min="0" step="0.01" value={l.unit_cost}
                        placeholder="0.00"
                        onChange={(e) => updateLine(l.item.id, { unit_cost: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="text" value={l.batch_no} placeholder="Auto"
                        onChange={(e) => updateLine(l.item.id, { batch_no: e.target.value })}
                      />
                    </td>
                    <td>
                      <DatePickerInput
                        selected={l.received_date}
                        onChange={(d) => updateLine(l.item.id, { received_date: d })}
                      />
                    </td>
                    <td>
                      <DatePickerInput
                        selected={l.expiration_date}
                        onChange={(d) => updateLine(l.item.id, { expiration_date: d })}
                        placeholderText={l.item.requires_expiry_tracking ? "Required" : "Optional"}
                        minDate={new Date()}
                      />
                      {errors[`exp_${l.item.id}`] && <span className="sm-error-text">{errors[`exp_${l.item.id}`]}</span>}
                    </td>
                    <td>
                      <button type="button" className="sm-remove-btn" title="Remove from this transaction (does not affect stock)" onClick={() => removeLine(l.item.id)}>
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {lines.length > 0 && (
        <div className="sm-card">
          <h3>Review</h3>
          <div className="sm-summary">
            <div className="sm-summary-row">
              <span className="sm-summary-label">Items in transaction</span>
              <span className="sm-summary-value">{lines.length}</span>
            </div>
            <div className="sm-summary-row">
              <span className="sm-summary-label">Total base units received</span>
              <span className="sm-summary-value delta-pos">+{totalUnits}</span>
            </div>
          </div>
          <div className="sm-actions" style={{ marginTop: "1rem" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setLines([])} disabled={submitting}>Clear</button>
            <button type="button" className="btn btn-primary" onClick={() => validate() && setConfirming(true)} disabled={submitting}>
              Review &amp; Confirm
            </button>
          </div>
        </div>
      )}

      <Modal
        isOpen={confirming}
        onClose={() => !submitting && setConfirming(false)}
        title="Confirm Stock In"
        subtitle={`${lines.length} item(s) · ${totalUnits} total units`}
        icon={faArrowDown}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={submitting}>Back</button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Posting…" : "Confirm Stock In"}
            </button>
          </>
        }
      >
        <div className="sm-summary">
          <div className="sm-summary-row"><span className="sm-summary-label">Type</span><span className="sm-summary-value">{STOCK_IN_TYPES.find((t) => t.value === transactionType)?.label}</span></div>
          {supplier && <div className="sm-summary-row"><span className="sm-summary-label">Supplier</span><span className="sm-summary-value">{supplier}</span></div>}
          {reference && <div className="sm-summary-row"><span className="sm-summary-label">Reference</span><span className="sm-summary-value">{reference}</span></div>}
          {lines.map((l) => (
            <div className="sm-summary-row" key={l.item.id}>
              <span className="sm-summary-label">{l.item.name} ({l.item.stock} in stock)</span>
              <span className="sm-summary-value delta-pos">+{parseInt(l.quantity, 10) || 0} → {(l.item.stock || 0) + (parseInt(l.quantity, 10) || 0)}</span>
            </div>
          ))}
        </div>
      </Modal>

      <PremiumToast {...toast} onClose={() => setToast((t) => ({ ...t, show: false }))} />
    </div>
  );
};

export default StockInPage;
