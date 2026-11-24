import React, { useCallback, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp, faTrash, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { inventoryApi } from "../../api/inventory.jsx";
import { showError } from "../../utils/alert.jsx";
import Modal from "../shared/Modal";
import PremiumToast from "../shared/PremiumToast";
import QuickItemSelector from "./QuickItemSelector";
import StockApprovalQueue from "./StockApprovalQueue";
import { EvidenceUpload } from "./EvidencePhoto";
import { uomOptionsFor, baseQuantity, formatUomHint } from "./uom";
import "./StockMovement.css";

const REASONS = [
  { value: "damaged", label: "Damaged" },
  { value: "expired", label: "Expired" },
  { value: "lost_missing", label: "Lost / Missing" },
  { value: "internal_usage", label: "Internal Usage" },
  { value: "service_consumption", label: "Service Consumption" },
  { value: "supplier_return", label: "Returned to Supplier" },
  { value: "disposal", label: "Disposal" },
  { value: "correction", label: "Inventory Correction" },
  { value: "other", label: "Other Authorized Withdrawal" },
];

// Mirrors the backend approval gate — UI hint only, server enforces.
const APPROVAL_REASONS = new Set([
  "damaged", "expired", "lost_missing", "internal_usage",
  "supplier_return", "disposal", "other",
]);

// Reasons that deplete physical batches (write-off) and may pick a batch.
const WRITE_OFF_REASONS = new Set(["damaged", "expired", "disposal", "lost_missing", "supplier_return"]);

const newIdemKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `out-${Date.now()}`;

const StockOutPage = () => {
  const [tab, setTab] = useState("new");
  const [reasonCode, setReasonCode] = useState("damaged");
  const [fields, setFields] = useState({});
  const [lines, setLines] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [idemKey, setIdemKey] = useState(newIdemKey());
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState({ show: false, type: "success", title: "", message: "" });

  const isCorrection = reasonCode === "correction";
  const totalUnits = useMemo(
    () => lines.reduce((s, l) => s + (isCorrection
      ? Math.abs((parseInt(l.physical_count, 10) || 0) - (l.item.stock || 0))
      : baseQuantity(l.item, l.quantity, l.unit)), 0),
    [lines, isCorrection]
  );

  const setField = (k, v) => setFields((f) => ({ ...f, [k]: v }));

  const fetchBatches = useCallback(async (itemId) => {
    try {
      const res = await inventoryApi.getItemBatches(itemId);
      const batches = Array.isArray(res) ? res : res?.batches || res?.data || [];
      return batches.filter((b) => (b.remaining_quantity || 0) > 0);
    } catch {
      return []; // batch picker is optional — FEFO/write-off still applies
    }
  }, []);

  const addItem = useCallback(async (item) => {
    const line = { item, quantity: 1, unit: "base", physical_count: item.stock, batch_id: "", batches: [] };
    setLines((prev) => [...prev, line]);
    if (WRITE_OFF_REASONS.has(reasonCode)) {
      const batches = await fetchBatches(item.id);
      setLines((prev) => prev.map((l) => (l.item.id === item.id ? { ...l, batches } : l)));
    }
  }, [reasonCode, fetchBatches]);

  // Switching reason changes which per-line inputs apply: entering a
  // write-off reason must load batch options for items added earlier, and
  // leaving one clears stale batch selections.
  const handleReasonChange = useCallback(async (next) => {
    setReasonCode(next);
    setErrors({});
    setFields((f) => ({ photo: f.photo || "" }));
    if (WRITE_OFF_REASONS.has(next)) {
      setLines((prev) => {
        prev.forEach((l) => {
          fetchBatches(l.item.id).then((batches) =>
            setLines((cur) => cur.map((x) => (x.item.id === l.item.id ? { ...x, batches } : x)))
          );
        });
        return prev.map((l) => ({ ...l, batch_id: "" }));
      });
    } else {
      setLines((prev) => prev.map((l) => ({ ...l, batch_id: "", batches: [] })));
    }
  }, [fetchBatches]);

  const removeLine = (itemId) => setLines((prev) => prev.filter((l) => l.item.id !== itemId));
  const updateLine = (itemId, patch) =>
    setLines((prev) => prev.map((l) => (l.item.id === itemId ? { ...l, ...patch } : l)));

  const validate = () => {
    const errs = {};
    const need = {
      damaged: ["damage_details"], expired: ["disposal_details"], lost_missing: ["incident_details"],
      internal_usage: ["department", "purpose"], service_consumption: ["service_reference"],
      supplier_return: ["supplier", "return_reference"], disposal: ["disposal_method"],
      correction: ["explanation"], other: ["explanation"],
    }[reasonCode] || [];
    need.forEach((f) => { if (!(fields[f] || "").trim()) errs[f] = "Required for this reason."; });
    lines.forEach((l) => {
      if (isCorrection) {
        const pc = parseInt(l.physical_count, 10);
        if (Number.isNaN(pc) || pc < 0) errs[`pc_${l.item.id}`] = "Enter a valid physical count.";
      } else {
        const q = parseInt(l.quantity, 10);
        if (!q || q <= 0) errs[`qty_${l.item.id}`] = "Qty must be > 0.";
        else {
          const base = baseQuantity(l.item, l.quantity, l.unit);
          if (base > l.item.stock) errs[`qty_${l.item.id}`] = `Only ${l.item.stock} ${l.item.unit || "units"} available.`;
        }
      }
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrors({});
    try {
      const payload = {
        reason_code: reasonCode,
        ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v?.trim?.() || null])),
        items: lines.map((l) => ({
          inventory_item_id: l.item.id,
          quantity: isCorrection ? null : parseInt(l.quantity, 10),
          unit: isCorrection ? null : (l.unit || "base"),
          physical_count: isCorrection ? parseInt(l.physical_count, 10) : null,
          batch_id: l.batch_id || null,
        })),
      };
      const res = await inventoryApi.stockOut(payload, { headers: { "Idempotency-Key": idemKey } });
      setConfirming(false);
      setLines([]);
      setFields({});
      setIdemKey(newIdemKey());
      if (res.queued) {
        setResult({ queued: true, ref: res.request?.request_no, txn: res.transaction_no });
        setToast({ show: true, type: "warning", title: "Queued for Approval", message: `${res.request?.request_no || res.transaction_no} — a manager/admin must approve before stock is deducted.` });
      } else {
        setResult({ queued: false, ref: res.transaction_no, txn: res.transaction_no });
        setToast({ show: true, type: "success", title: "Stock Out Recorded", message: `Transaction ${res.transaction_no} posted — stock deducted.` });
      }
    } catch (err) {
      const apiErrors = err?.response?.errors;
      if (apiErrors && typeof apiErrors === "object") setErrors(apiErrors);
      showError(err.message || "Stock-out failed.", "Stock Out");
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  const reasonField = (key, label, textarea = false) => (
    <div className={`sm-field ${textarea ? "sm-full" : ""}`} key={key}>
      <label>{label} *</label>
      {textarea ? (
        <textarea value={fields[key] || ""} onChange={(e) => setField(key, e.target.value)} />
      ) : (
        <input type="text" value={fields[key] || ""} onChange={(e) => setField(key, e.target.value)} />
      )}
      {errors[key] && <span className="sm-error-text">{Array.isArray(errors[key]) ? errors[key][0] : errors[key]}</span>}
    </div>
  );

  const reasonFields = () => {
    switch (reasonCode) {
      case "damaged":
        return <>
          {reasonField("damage_details", "Damage details (category, description, evidence)", true)}
          <div className="sm-field sm-full" key="photo">
            <EvidenceUpload label="Photo evidence (optional)" value={fields.photo || ""} onChange={(p) => setField("photo", p)} />
          </div>
        </>;
      case "expired":
        return <>
          {reasonField("disposal_details", "Disposal details (method, where disposed)", true)}
          <div className="sm-field sm-full" key="photo">
            <EvidenceUpload label="Photo evidence (optional)" value={fields.photo || ""} onChange={(p) => setField("photo", p)} />
          </div>
        </>;
      case "lost_missing":
        return <>
          {reasonField("incident_details", "Incident description / investigation reference", true)}
          <div className="sm-field sm-full" key="photo">
            <EvidenceUpload label="Incident photo / reference (optional)" value={fields.photo || ""} onChange={(p) => setField("photo", p)} />
          </div>
        </>;
      case "internal_usage":
        return <>{reasonField("department", "Department")}{reasonField("purpose", "Purpose")}</>;
      case "service_consumption":
        return reasonField("service_reference", "Related service / treatment record");
      case "supplier_return":
        return <>{reasonField("supplier", "Supplier")}{reasonField("return_reference", "Supplier return reference")}</>;
      case "disposal":
        return reasonField("disposal_method", "Disposal method / authorization");
      case "correction":
      case "other":
        return reasonField("explanation", reasonCode === "correction" ? "Explanation (count discrepancy)" : "Detailed explanation", true);
      default:
        return null;
    }
  };

  return (
    <div className="sm-page">
      <div className="sm-header">
        <div>
          <h1><FontAwesomeIcon icon={faArrowUp} /> Stock Out</h1>
          <div className="sm-subtitle">Authorized withdrawals — every removal records a reason, supporting details and the responsible user.</div>
        </div>
      </div>

      <div className="sm-tabs">
        <button type="button" className={`sm-tab ${tab === "new" ? "active" : ""}`} onClick={() => setTab("new")}>New Withdrawal</button>
        <button type="button" className={`sm-tab ${tab === "requests" ? "active" : ""}`} onClick={() => setTab("requests")}>My Requests</button>
      </div>

      {result && (
        <div className="sm-queued-notice">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          {result.queued
            ? <>Last request <strong>{result.ref}</strong> is pending manager/admin approval — stock untouched until then.</>
            : <>Last transaction posted: <strong>{result.txn}</strong></>}
        </div>
      )}

      {tab === "requests" ? (
        <StockApprovalQueue canReview={false} mineOnly />
      ) : (
        <>
          {APPROVAL_REASONS.has(reasonCode) && (
            <div className="sm-queued-notice">
              <FontAwesomeIcon icon={faExclamationTriangle} />
              The “{REASONS.find((r) => r.value === reasonCode)?.label}” reason requires manager/admin approval before stock is deducted.
            </div>
          )}

          <div className="sm-card">
            <h3>Withdrawal Reason</h3>
            <div className="sm-form-grid">
              <div className="sm-field">
                <label>Removal reason *</label>
                <select value={reasonCode} onChange={(e) => handleReasonChange(e.target.value)}>
                  {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              {reasonFields()}
            </div>
            {isCorrection && (
              <div className="sm-helper" style={{ marginTop: "0.5rem" }}>
                A correction reconciles recorded stock to the physical count — it is not a product return. Enter the physically counted quantity per line; only discrepancies are recorded.
              </div>
            )}
          </div>

          <div className="sm-card">
            <h3>Add Items</h3>
            <QuickItemSelector onSelect={addItem} excludeIds={lines.map((l) => l.item.id)} />

            {lines.length === 0 ? (
              <div className="sm-empty-lines">Search and select items above. POS sales and approved customer orders deduct automatically — use this only for the reasons listed.</div>
            ) : (
              <div className="sm-table-wrap" style={{ marginTop: "1rem" }}>
                <table className="sm-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Available</th>
                      {isCorrection ? <th>Physical Count *</th> : <th>Quantity *</th>}
                      {WRITE_OFF_REASONS.has(reasonCode) && <th>Batch</th>}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const pc = parseInt(l.physical_count, 10);
                      const delta = isCorrection && !Number.isNaN(pc) ? pc - l.item.stock : 0;
                      return (
                        <tr key={l.item.id}>
                          <td>
                            <span className="sm-line-item">{l.item.name}</span>
                            <span className="sm-line-sku">{l.item.sku || "—"} · {l.item.unit || "units"}</span>
                          </td>
                          <td>{l.item.stock}</td>
                          {isCorrection ? (
                            <td>
                              <input
                                type="number" min="0" value={l.physical_count}
                                onChange={(e) => updateLine(l.item.id, { physical_count: e.target.value })}
                              />
                              <span className={`sm-helper`}>
                                {delta === 0 ? "No change" : delta > 0 ? `+${delta} increase` : `${delta} decrease`}
                              </span>
                              {errors[`pc_${l.item.id}`] && <span className="sm-error-text">{errors[`pc_${l.item.id}`]}</span>}
                            </td>
                          ) : (
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
                              <span className="sm-helper">
                                {formatUomHint(l.item, l.quantity, l.unit) && `${formatUomHint(l.item, l.quantity, l.unit)} · `}
                                New: {Math.max(0, l.item.stock - baseQuantity(l.item, l.quantity, l.unit))}
                              </span>
                              {errors[`qty_${l.item.id}`] && <span className="sm-error-text">{errors[`qty_${l.item.id}`]}</span>}
                            </td>
                          )}
                          {WRITE_OFF_REASONS.has(reasonCode) && (
                            <td>
                              <select
                                value={l.batch_id}
                                onChange={(e) => updateLine(l.item.id, { batch_id: e.target.value ? parseInt(e.target.value, 10) : "" })}
                              >
                                <option value="">Auto (oldest/expired first)</option>
                                {l.batches.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.batch_no} — {b.remaining_quantity} left{b.expiration_date ? ` · exp ${String(b.expiration_date).slice(0, 10)}` : ""}
                                  </option>
                                ))}
                              </select>
                            </td>
                          )}
                          <td>
                            <button type="button" className="sm-remove-btn" title="Remove from this transaction (does not affect stock)" onClick={() => removeLine(l.item.id)}>
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
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
                  <span className="sm-summary-label">Reason</span>
                  <span className="sm-summary-value">{REASONS.find((r) => r.value === reasonCode)?.label}</span>
                </div>
                <div className="sm-summary-row">
                  <span className="sm-summary-label">Items</span>
                  <span className="sm-summary-value">{lines.length}</span>
                </div>
                <div className="sm-summary-row">
                  <span className="sm-summary-label">Units affected</span>
                  <span className="sm-summary-value delta-neg">{isCorrection ? `±${totalUnits}` : `−${totalUnits}`}</span>
                </div>
                {APPROVAL_REASONS.has(reasonCode) && (
                  <div className="sm-summary-row">
                    <span className="sm-summary-label">Execution</span>
                    <span className="sm-summary-value">Queued for approval</span>
                  </div>
                )}
              </div>
              <div className="sm-actions" style={{ marginTop: "1rem" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setLines([])} disabled={submitting}>Clear</button>
                <button type="button" className="btn btn-primary" onClick={() => validate() && setConfirming(true)} disabled={submitting}>
                  Review &amp; Confirm
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={confirming}
        onClose={() => !submitting && setConfirming(false)}
        title={APPROVAL_REASONS.has(reasonCode) ? "Submit for Approval" : "Confirm Stock Out"}
        subtitle={`${lines.length} item(s) · ${REASONS.find((r) => r.value === reasonCode)?.label}`}
        icon={faArrowUp}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={submitting}>Back</button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting…" : APPROVAL_REASONS.has(reasonCode) ? "Submit Request" : "Confirm Stock Out"}
            </button>
          </>
        }
      >
        <div className="sm-summary">
          {lines.map((l) => {
            const qty = isCorrection
              ? (parseInt(l.physical_count, 10) || 0) - l.item.stock
              : -baseQuantity(l.item, l.quantity, l.unit);
            return (
              <div className="sm-summary-row" key={l.item.id}>
                <span className="sm-summary-label">{l.item.name} (now {l.item.stock})</span>
                <span className={`sm-summary-value ${qty <= 0 ? "delta-neg" : "delta-pos"}`}>
                  {qty > 0 ? `+${qty}` : qty} → {l.item.stock + qty}
                </span>
              </div>
            );
          })}
        </div>
      </Modal>

      <PremiumToast {...toast} onClose={() => setToast((t) => ({ ...t, show: false }))} />
    </div>
  );
};

export default StockOutPage;
