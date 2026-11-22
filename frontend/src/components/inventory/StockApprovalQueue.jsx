import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClipboardCheck, faCheck, faTimes, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { inventoryApi } from "../../api/inventory.jsx";
import { showError, showPrompt } from "../../utils/alert.jsx";
import Modal from "../shared/Modal";
import StatusBadge from "../shared/StatusBadge";
import PremiumToast from "../shared/PremiumToast";
import { EvidenceImage } from "./EvidencePhoto";
import "./StockMovement.css";

const newIdemKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `rq-${Date.now()}`;

const STATUS_FILTERS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "", label: "All" },
];

const statusVariant = (s) =>
  s === "approved" ? "success" : s === "rejected" ? "danger" : "warning";

const REASON_FIELD_LABELS = {
  damage_details: "Damage details",
  disposal_details: "Disposal details",
  incident_details: "Incident details",
  department: "Department",
  purpose: "Purpose",
  service_reference: "Service record",
  supplier: "Supplier",
  return_reference: "Return reference",
  disposal_method: "Disposal method",
  explanation: "Explanation",
  photo: "Evidence",
};

/**
 * Shared stock-out approval queue. `canReview` renders approve/reject
 * actions (manager/admin portals); requesters see status only.
 */
const StockApprovalQueue = ({ canReview = false, mineOnly = false }) => {
  const [status, setStatus] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [acting, setActing] = useState(false);
  const [toast, setToast] = useState({ show: false, type: "success", title: "", message: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getStockRequests({ status: status || undefined, mine: mineOnly || undefined, page });
      setRequests(res?.requests || []);
      setMeta(res?.meta || { current_page: 1, last_page: 1, total: 0 });
    } catch (err) {
      setRequests([]);
      setToast({ show: true, type: "error", title: "Load Failed", message: err.message });
    } finally {
      setLoading(false);
    }
  }, [status, page, mineOnly]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id) => {
    try {
      const res = await inventoryApi.getStockRequest(id);
      setDetail(res?.request || null);
    } catch (err) {
      showError(err.message, "Request");
    }
  };

  const approve = async () => {
    setActing(true);
    try {
      await inventoryApi.approveStockRequest(detail.id, "", { headers: { "Idempotency-Key": newIdemKey() } });
      setToast({ show: true, type: "success", title: "Approved", message: `${detail.request_no} executed — stock deducted.` });
      setDetail(null);
      load();
    } catch (err) {
      showError(err.message, "Approve");
    } finally {
      setActing(false);
    }
  };

  const reject = async () => {
    const remarks = await showPrompt("Reason for rejecting this stock-out request:", "Reject Request");
    if (remarks === null) return;
    if (!String(remarks).trim()) {
      showError("Rejection remarks are required.", "Reject Request");
      return;
    }
    setActing(true);
    try {
      await inventoryApi.rejectStockRequest(detail.id, remarks, { headers: { "Idempotency-Key": newIdemKey() } });
      setToast({ show: true, type: "success", title: "Rejected", message: `${detail.request_no} rejected — stock unchanged.` });
      setDetail(null);
      load();
    } catch (err) {
      showError(err.message, "Reject");
    } finally {
      setActing(false);
    }
  };

  const pendingCount = status === "pending" ? meta.total : null;

  return (
    <div className="sm-card">
      <h3>
        <FontAwesomeIcon icon={faClipboardCheck} /> Stock-Out Approval Queue
        {pendingCount !== null && <span className="sm-tab-count">{pendingCount}</span>}
      </h3>

      <div className="sm-tabs" style={{ marginBottom: "1rem" }}>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`sm-tab ${status === f.value ? "active" : ""}`}
            onClick={() => { setStatus(f.value); setPage(1); }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="sm-loading"><FontAwesomeIcon icon={faSpinner} spin /> Loading requests…</div>
      ) : requests.length === 0 ? (
        <div className="sm-empty-state">No {status || ""} stock-out requests.</div>
      ) : (
        <div className="sm-table-wrap">
          <table className="sm-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Reason</th>
                <th>Items</th>
                <th>Requested By</th>
                <th>Status</th>
                <th>Submitted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="sm-line-item">{r.request_no}</span>
                    <span className="sm-line-sku">{r.transaction_no}</span>
                  </td>
                  <td>{r.reason_label || r.reason_code}</td>
                  <td>{r.items?.length || 0} line(s), {r.items?.reduce((s, i) => s + (i.quantity || 0), 0)} unit(s)</td>
                  <td>{r.requested_by_name || `#${r.requested_by}`}</td>
                  <td><StatusBadge variant={statusVariant(r.status)}>{r.status}</StatusBadge></td>
                  <td>{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
                  <td>
                    <button type="button" className="sm-link-btn" onClick={() => openDetail(r.id)}>View</button>
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

      <Modal
        isOpen={!!detail}
        onClose={() => !acting && setDetail(null)}
        title={detail ? `Request ${detail.request_no}` : "Request"}
        subtitle={detail ? `${detail.reason_label} · submitted by ${detail.requested_by_name || "staff"}` : ""}
        size="lg"
        icon={faClipboardCheck}
        footer={canReview && detail?.status === "pending" ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={reject} disabled={acting}>
              <FontAwesomeIcon icon={faTimes} /> Reject
            </button>
            <button type="button" className="btn btn-primary" onClick={approve} disabled={acting}>
              <FontAwesomeIcon icon={faCheck} /> {acting ? "Executing…" : "Approve & Deduct Stock"}
            </button>
          </>
        ) : undefined}
      >
        {detail && (
          <div className="sm-summary">
            {Object.entries(detail.request_payload || {}).map(([k, v]) => v ? (
              <div className="sm-summary-row" key={k}>
                <span className="sm-summary-label">{REASON_FIELD_LABELS[k] || k}</span>
                {k === "photo" ? (
                  <span className="sm-summary-value"><EvidenceImage photo={v} /></span>
                ) : (
                  <span className="sm-summary-value" style={{ fontWeight: 500 }}>{String(v)}</span>
                )}
              </div>
            ) : null)}
            {detail.items?.map((line) => (
              <div className="sm-summary-row" key={line.id}>
                <span className="sm-summary-label">
                  {line.item_name} ({line.item_sku || "—"}) · in stock: {line.current_stock}
                  {line.line_details?.physical_count !== undefined &&
                    ` · physical count: ${line.line_details.physical_count}`}
                </span>
                <span className="sm-summary-value delta-neg">−{line.quantity}</span>
              </div>
            ))}
            {detail.review_remarks && (
              <div className="sm-summary-row">
                <span className="sm-summary-label">Review remarks ({detail.reviewed_by_name || "reviewer"})</span>
                <span className="sm-summary-value" style={{ fontWeight: 500 }}>{detail.review_remarks}</span>
              </div>
            )}
          </div>
        )}
      </Modal>

      <PremiumToast {...toast} onClose={() => setToast((t) => ({ ...t, show: false }))} />
    </div>
  );
};

export default StockApprovalQueue;
