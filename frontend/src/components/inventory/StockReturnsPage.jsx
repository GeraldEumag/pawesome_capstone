import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateLeft, faPlus, faSpinner, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { inventoryApi } from "../../api/inventory.jsx";
import { showError } from "../../utils/alert.jsx";
import Modal from "../shared/Modal";
import StatusBadge from "../shared/StatusBadge";
import PremiumToast from "../shared/PremiumToast";
import QuickItemSelector from "./QuickItemSelector";
import { EvidenceUpload, EvidenceImage } from "./EvidencePhoto";
import "./StockMovement.css";

const newIdemKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `ret-${Date.now()}`;

const STATUS_FILTERS = [
  { value: "pending_inspection", label: "Pending Inspection" },
  { value: "quarantined", label: "Quarantined" },
  { value: "restocked", label: "Restocked" },
  { value: "damaged", label: "Damaged" },
  { value: "disposed", label: "Disposed" },
  { value: "", label: "All" },
];

const statusVariant = (s) =>
  s === "restocked" ? "success" : s === "damaged" || s === "disposed" ? "danger" : "warning";

const DISPOSITIONS = [
  { value: "restock", label: "Restock — suitable for resale, returns to stock" },
  { value: "quarantine", label: "Quarantine — hold for further inspection" },
  { value: "damaged", label: "Damaged — does not return to stock" },
  { value: "dispose", label: "Dispose — discard, does not return to stock" },
];

const StockReturnsPage = () => {
  const [status, setStatus] = useState("pending_inspection");
  const [returns, setReturns] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [inspectTarget, setInspectTarget] = useState(null);
  const [disposition, setDisposition] = useState("restock");
  const [inspectNotes, setInspectNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ show: false, type: "success", title: "", message: "" });

  // Create-return form state
  const [selItem, setSelItem] = useState(null);
  const [qty, setQty] = useState(1);
  const [sourceType, setSourceType] = useState("manual");
  const [sourceId, setSourceId] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [returnPhoto, setReturnPhoto] = useState("");
  const [inspectPhoto, setInspectPhoto] = useState("");
  const [createIdemKey, setCreateIdemKey] = useState(() => newIdemKey());
  const [dispositionIdemKey, setDispositionIdemKey] = useState(() => newIdemKey());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getReturns({ status: status || undefined, page });
      setReturns(res?.returns || []);
      setMeta(res?.meta || { current_page: 1, last_page: 1, total: 0 });
    } catch (err) {
      setReturns([]);
      setToast({ show: true, type: "error", title: "Load Failed", message: err.message });
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  const resetCreate = () => {
    setSelItem(null);
    setQty(1);
    setSourceType("manual");
    setSourceId("");
    setReturnReason("");
    setReturnPhoto("");
    setCreateIdemKey(newIdemKey());
  };

  const submitCreate = async () => {
    if (!selItem) { showError("Select the returned item first.", "Record Return"); return; }
    if (!qty || qty <= 0) { showError("Quantity must be greater than zero.", "Record Return"); return; }
    if (!returnReason.trim()) { showError("Return reason is required.", "Record Return"); return; }
    setSubmitting(true);
    try {
      await inventoryApi.createReturn({
        inventory_item_id: selItem.id,
        quantity: parseInt(qty, 10),
        source_type: sourceType,
        source_id: sourceId ? parseInt(sourceId, 10) : null,
        return_reason: returnReason.trim(),
        photo: returnPhoto || null,
      }, { headers: { "Idempotency-Key": createIdemKey } });
      setCreateOpen(false);
      resetCreate();
      setToast({ show: true, type: "success", title: "Return Recorded", message: "Item is now pending inspection — stock is unchanged until dispositioned." });
      setStatus("pending_inspection");
      setPage(1);
      load();
    } catch (err) {
      if (err?.status >= 400 && err.status < 500) {
        // The middleware may cache deterministic 4xx responses; corrected
        // submissions need a fresh key, while uncertain failures reuse theirs.
        setCreateIdemKey(newIdemKey());
      }
      showError(err.message, "Record Return");
    } finally {
      setSubmitting(false);
    }
  };

  const submitDisposition = async () => {
    setSubmitting(true);
    try {
      await inventoryApi.submitReturnDisposition(
        inspectTarget.id,
        { disposition, inspection_notes: inspectNotes.trim() || null, photo: inspectPhoto || null },
        { headers: { "Idempotency-Key": dispositionIdemKey } }
      );
      setInspectTarget(null);
      setDispositionIdemKey(newIdemKey());
      setInspectNotes("");
      setInspectPhoto("");
      setDisposition("restock");
      setToast({
        show: true,
        type: disposition === "restock" ? "success" : "warning",
        title: "Disposition Recorded",
        message: disposition === "restock" ? "Item returned to sellable stock." : `Marked as ${disposition} — stays out of sellable stock.`,
      });
      load();
    } catch (err) {
      if (err?.status >= 400 && err.status < 500) {
        setDispositionIdemKey(newIdemKey());
      }
      showError(err.message, "Inspect Return");
    } finally {
      setSubmitting(false);
    }
  };

  const dispositionsFor = (r) =>
    r.status === "quarantined"
      ? DISPOSITIONS.filter((d) => ["restock", "dispose"].includes(d.value))
      : DISPOSITIONS;

  const canInspect = (r) => ["pending_inspection", "quarantined"].includes(r.status);

  return (
    <div className="sm-page">
      <div className="sm-header">
        <div>
          <h1><FontAwesomeIcon icon={faRotateLeft} /> Stock Returns</h1>
          <div className="sm-subtitle">Customer product returns go through inspection — only approved restockable items return to sellable stock.</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          <FontAwesomeIcon icon={faPlus} /> Record Return
        </button>
      </div>

      <div className="sm-card">
        <div className="sm-tabs" style={{ marginBottom: "1rem" }}>
          {STATUS_FILTERS.map((f) => (
            <button key={f.value} type="button" className={`sm-tab ${status === f.value ? "active" : ""}`}
              onClick={() => { setStatus(f.value); setPage(1); }}>
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="sm-loading"><FontAwesomeIcon icon={faSpinner} spin /> Loading returns…</div>
        ) : returns.length === 0 ? (
          <div className="sm-empty-state">No returns match this filter.</div>
        ) : (
          <div className="sm-table-wrap">
            <table className="sm-table">
              <thead>
                <tr>
                  <th>Return No.</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Source</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Received</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r) => (
                  <tr key={r.id}>
                    <td><span className="sm-line-item">{r.return_no}</span></td>
                    <td>
                      <span className="sm-line-item">{r.item?.name || `#${r.inventory_item_id}`}</span>
                      <span className="sm-line-sku">{r.item?.sku || "—"}</span>
                    </td>
                    <td>{r.quantity}</td>
                    <td>{r.source_type}{r.source_id ? ` #${r.source_id}` : ""}</td>
                    <td>{r.return_reason || "—"}</td>
                    <td><StatusBadge variant={statusVariant(r.status)}>{r.status.replace("_", " ")}</StatusBadge></td>
                    <td>
                      <span className="sm-line-sku">
                        {r.receiver?.name || "—"}<br />
                        {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                      </span>
                    </td>
                    <td>
                      {canInspect(r) && (
                        <button type="button" className="sm-link-btn" onClick={() => { setInspectTarget(r); setDisposition("restock"); setInspectPhoto(""); setInspectNotes(""); setDispositionIdemKey(newIdemKey()); }}>
                          <FontAwesomeIcon icon={faMagnifyingGlass} /> Inspect
                        </button>
                      )}
                      {r.disposition && !canInspect(r) && <span className="sm-line-sku">{r.disposition}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta.last_page > 1 && (
          <div className="sm-pagination">
            <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span>Page {meta.current_page} of {meta.last_page}</span>
            <button type="button" className="btn btn-secondary" disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </div>

      {/* Record return modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => !submitting && setCreateOpen(false)}
        title="Record Product Return"
        subtitle="The item stays out of stock until inspection approves restock."
        icon={faRotateLeft}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)} disabled={submitting}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={submitCreate} disabled={submitting}>
              {submitting ? "Saving…" : "Record Return"}
            </button>
          </>
        }
      >
        <div className="sm-form-grid">
          <div className="sm-field sm-full">
            <label>Returned item *</label>
            {selItem ? (
              <div className="sm-disposition-option selected">
                <span style={{ flex: 1 }}><strong>{selItem.name}</strong> <span className="sm-line-sku">{selItem.sku || ""} · {selItem.stock} in stock</span></span>
                <button type="button" className="sm-remove-btn" onClick={() => setSelItem(null)}>×</button>
              </div>
            ) : (
              <QuickItemSelector onSelect={setSelItem} placeholder="Search the returned item…" />
            )}
          </div>
          <div className="sm-field">
            <label>Quantity *</label>
            <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="sm-field">
            <label>Source</label>
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
              <option value="manual">Manual / Walk-in</option>
              <option value="sale">POS Sale</option>
              <option value="customer_order">Customer Order</option>
            </select>
          </div>
          {sourceType !== "manual" && (
            <div className="sm-field">
              <label>Original {sourceType === "sale" ? "sale" : "order"} ID</label>
              <input type="number" min="1" value={sourceId} onChange={(e) => setSourceId(e.target.value)} placeholder="Original transaction id" />
            </div>
          )}
          <div className="sm-field sm-full">
            <label>Return reason *</label>
            <textarea value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="Why is the customer returning this item?" />
          </div>
          <div className="sm-field sm-full">
            <EvidenceUpload label="Return photo (optional)" value={returnPhoto} onChange={setReturnPhoto} />
          </div>
        </div>
      </Modal>

      {/* Inspect / disposition modal */}
      <Modal
        isOpen={!!inspectTarget}
        onClose={() => !submitting && setInspectTarget(null)}
        title={inspectTarget ? `Inspect ${inspectTarget.return_no}` : "Inspect"}
        subtitle={inspectTarget ? `${inspectTarget.item?.name || "Item"} · ${inspectTarget.quantity} unit(s) · ${inspectTarget.return_reason || "no reason recorded"}` : ""}
        icon={faMagnifyingGlass}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setInspectTarget(null)} disabled={submitting}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={submitDisposition} disabled={submitting}>
              {submitting ? "Saving…" : "Apply Disposition"}
            </button>
          </>
        }
      >
        <div className="sm-disposition-grid">
          {inspectTarget && dispositionsFor(inspectTarget).map((d) => (
            <label key={d.value} className={`sm-disposition-option ${disposition === d.value ? "selected" : ""}`}>
              <input type="radio" name="disposition" value={d.value} checked={disposition === d.value} onChange={() => setDisposition(d.value)} />
              <span>{d.label}</span>
            </label>
          ))}
        </div>
        {inspectTarget?.photo && (
          <div className="sm-field" style={{ marginBottom: "0.75rem" }}>
            <label>Return photo</label>
            <EvidenceImage photo={inspectTarget.photo} />
          </div>
        )}
        <div className="sm-field">
          <label>Inspection notes</label>
          <textarea value={inspectNotes} onChange={(e) => setInspectNotes(e.target.value)} placeholder="Condition, findings, packaging state…" />
        </div>
        <div className="sm-field">
          <EvidenceUpload label="Inspection photo (optional)" value={inspectPhoto} onChange={setInspectPhoto} />
        </div>
      </Modal>

      <PremiumToast {...toast} onClose={() => setToast((t) => ({ ...t, show: false }))} />
    </div>
  );
};

export default StockReturnsPage;
