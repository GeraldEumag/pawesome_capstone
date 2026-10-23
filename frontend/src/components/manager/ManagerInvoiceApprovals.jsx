import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";
import { showPrompt } from "../../utils/alert.jsx";
import "./ManagerInvoiceApprovals.css";

const peso = (n) =>
  `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TYPE_LABELS = {
  discount: "Discount",
  waiver: "Waiver",
  write_off: "Write-off",
  credit_note: "Credit note",
};

/**
 * Pending visit-invoice adjustments that need manager approval (waivers,
 * write-offs and amounts at/above the configured limit).
 */
const ManagerInvoiceApprovals = () => {
  const [tab, setTab] = useState("invoices");
  const [adjustments, setAdjustments] = useState([]);
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [res, auditRes] = await Promise.all([
        apiRequest("/manager/visit-invoice-adjustments/pending"),
        apiRequest("/manager/inventory-audits/pending"),
      ]);
      setAdjustments(Array.isArray(res?.adjustments) ? res.adjustments : []);
      setAudits(Array.isArray(auditRes?.audits) ? auditRes.audits : []);
    } catch (err) {
      toast.error(err.message || "Failed to load pending approvals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (adjustment, action) => {
    let body = {};
    if (action === "reject") {
      const reason = await showPrompt(
        "Reason for rejecting this adjustment (optional):",
        "Reject Adjustment"
      );
      if (reason === null) return; // cancelled
      body = { reason: reason || undefined };
    }
    try {
      setBusy(adjustment.id);
      await apiRequest(
        `/manager/visit-invoice-adjustments/${adjustment.id}/${action}`,
        "POST",
        body
      );
      toast.success(
        action === "approve" ? "Adjustment approved and applied." : "Adjustment rejected."
      );
      await load();
    } catch (err) {
      toast.error(err.message || "Action failed.");
    } finally {
      setBusy(null);
    }
  };

  const decideAudit = async (audit, action) => {
    let body = {};
    if (action === "reject") {
      const reason = await showPrompt(
        "Reason for rejecting this variance (required):",
        "Reject Audit Variance"
      );
      if (reason === null) return;
      if (!reason.trim()) {
        toast.error("A rejection reason is required.");
        return;
      }
      body = { reason };
    }
    try {
      setBusy(`audit-${audit.id}`);
      await apiRequest(`/manager/inventory-audits/${audit.id}/${action}`, "POST", body);
      toast.success(action === "approve" ? "Variance approved." : "Variance rejected.");
      await load();
    } catch (err) {
      toast.error(err.message || "Action failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mgr-approvals-page">
      <header className="mgr-approvals-header">
        <h2>Approvals</h2>
        <p>
          Waivers, write-offs and large adjustments need approval; inventory
          count variances get reviewed here too.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
          <button
            type="button"
            className={`mgr-btn${tab === "invoices" ? " mgr-btn--approve" : ""}`}
            onClick={() => setTab("invoices")}
          >
            Invoice Adjustments ({adjustments.length})
          </button>
          <button
            type="button"
            className={`mgr-btn${tab === "audits" ? " mgr-btn--approve" : ""}`}
            onClick={() => setTab("audits")}
          >
            Inventory Variances ({audits.length})
          </button>
        </div>
      </header>

      {loading ? (
        <div className="mgr-approvals-empty">Loading…</div>
      ) : tab === "audits" ? (
        audits.length === 0 ? (
          <div className="mgr-approvals-empty">No inventory variances waiting for approval.</div>
        ) : (
          <ul className="mgr-approvals-list">
            {audits.map((audit) => (
              <li key={audit.id} className="mgr-approval-card">
                <div className="mgr-approval-main">
                  <div className="mgr-approval-title">
                    <strong>{audit.item?.name || `Item #${audit.inventory_item_id}`}</strong>
                    <span className="mgr-approval-amount">
                      Variance {audit.variance > 0 ? `+${audit.variance}` : audit.variance}
                    </span>
                  </div>
                  <div className="mgr-approval-meta">
                    <span>Month {audit.audit_month}</span>
                    <span>System {audit.system_stock} → counted {audit.actual_stock}</span>
                    <span>Counted by {audit.checked_by || "staff"}</span>
                  </div>
                  {audit.reason && <p className="mgr-approval-notes">{audit.reason}</p>}
                </div>
                <div className="mgr-approval-actions">
                  <button
                    type="button"
                    className="mgr-btn mgr-btn--approve"
                    disabled={busy === `audit-${audit.id}`}
                    onClick={() => decideAudit(audit, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="mgr-btn mgr-btn--reject"
                    disabled={busy === `audit-${audit.id}`}
                    onClick={() => decideAudit(audit, "reject")}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : adjustments.length === 0 ? (
        <div className="mgr-approvals-empty">No adjustments waiting for approval.</div>
      ) : (
        <ul className="mgr-approvals-list">
          {adjustments.map((a) => (
            <li key={a.id} className="mgr-approval-card">
              <div className="mgr-approval-main">
                <div className="mgr-approval-title">
                  <strong>{TYPE_LABELS[a.type] || a.type}</strong>
                  <span className="mgr-approval-amount">{peso(a.amount)}</span>
                </div>
                <div className="mgr-approval-meta">
                  <span>Invoice {a.invoice_number || `#${a.invoice_id}`}</span>
                  <span>Reason: {a.reason_code}</span>
                  <span>Requested by {a.requested_by || "staff"}</span>
                  <span>
                    {a.created_at ? new Date(a.created_at).toLocaleString() : ""}
                  </span>
                </div>
                {a.notes && <p className="mgr-approval-notes">{a.notes}</p>}
              </div>
              <div className="mgr-approval-actions">
                <button
                  type="button"
                  className="mgr-btn mgr-btn--approve"
                  disabled={busy === a.id}
                  onClick={() => decide(a, "approve")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="mgr-btn mgr-btn--reject"
                  disabled={busy === a.id}
                  onClick={() => decide(a, "reject")}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ManagerInvoiceApprovals;
