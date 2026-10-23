import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faFileInvoiceDollar,
  faPaperPlane,
  faPlus,
  faSave,
  faSpinner,
  faTrash,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";

const STATUS_LABELS = {
  draft: "Draft",
  presented: "Awaiting Approval",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Re-approval Needed",
};

const peso = (n) =>
  `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const emptyLine = () => ({ description: "", quantity: 1, unit_price: "" });

/**
 * Visit estimate: vet drafts projected charges, the customer approves via the
 * portal or staff records a counter approval. Estimates are optional —
 * charges are never blocked — but when actual charges exceed an approved
 * total past the threshold the estimate returns to changes_requested so the
 * customer can be shown the updated projection.
 */
const VetEstimatePanel = ({ appointmentId, disabled, emergency, onChanged }) => {
  const [estimate, setEstimate] = useState(null);
  const [lines, setLines] = useState([emptyLine()]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiRequest(`/veterinary/appointments/${appointmentId}/estimate`);
      const est = res?.estimate || null;
      setEstimate(est);
      if (est?.lines?.length) {
        setLines(
          est.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unit_price,
          }))
        );
      }
    } catch (err) {
      toast.error(err.message || "Failed to load estimate.");
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const editable =
    !disabled && (!estimate || ["draft", "changes_requested"].includes(estimate.status));

  const subtotal = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
    0
  );

  const updateLine = (i, field, value) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));

  const act = async (fn, successMsg) => {
    try {
      setBusy(true);
      await fn();
      if (successMsg) toast.success(successMsg);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message || "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = () =>
    act(async () => {
      const payload = lines
        .filter((l) => l.description.trim() !== "")
        .map((l) => ({
          description: l.description.trim(),
          quantity: Math.max(1, Number(l.quantity) || 1),
          unit_price: Number(l.unit_price) || 0,
        }));
      if (!payload.length) {
        throw new Error("Add at least one estimate line.");
      }
      await apiRequest(`/veterinary/appointments/${appointmentId}/estimate`, "PUT", {
        lines: payload,
      });
    }, "Estimate saved.");

  const status = estimate?.status;

  return (
    <div className="consult-section-card">
      <div className="consult-section-header">
        <div className="consult-section-icon">
          <FontAwesomeIcon icon={faFileInvoiceDollar} />
        </div>
        <div className="consult-section-title-group">
          <h3>Treatment Estimate</h3>
          <p>
            Optional projected charges for customer review — the visit bill
            can be finalized without an estimate.
          </p>
        </div>
        {status && (
          <span className={`consult-apt-badge estimate-badge--${status}`}>
            {STATUS_LABELS[status] || status}
            {estimate?.version > 1 ? ` v${estimate.version}` : ""}
          </span>
        )}
      </div>

      {loading ? (
        <div className="consult-rx-empty">
          <FontAwesomeIcon icon={faSpinner} spin /> Loading estimate…
        </div>
      ) : (
        <>
          {status === "changes_requested" && (
            <div className="estimate-warning">
              <FontAwesomeIcon icon={faTriangleExclamation} />
              Projected charges exceeded the approved estimate by more than the
              allowed threshold — consider presenting the updated estimate to
              the customer for re-approval.
            </div>
          )}

          <div className="estimate-lines">
            <div className="estimate-line estimate-line--head">
              <span>Item</span>
              <span>Qty</span>
              <span>Unit Price</span>
              <span>Total</span>
              {editable && <span />}
            </div>
            {lines.map((line, i) => (
              <div className="estimate-line" key={i}>
                <input
                  type="text"
                  value={line.description}
                  placeholder="Procedure or item…"
                  disabled={!editable}
                  onChange={(e) => updateLine(i, "description", e.target.value)}
                />
                <input
                  type="number"
                  min="1"
                  value={line.quantity}
                  disabled={!editable}
                  onChange={(e) => updateLine(i, "quantity", e.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unit_price}
                  disabled={!editable}
                  onChange={(e) => updateLine(i, "unit_price", e.target.value)}
                />
                <span className="estimate-line-total">
                  {peso((Number(line.quantity) || 0) * (Number(line.unit_price) || 0))}
                </span>
                {editable && (
                  <button
                    type="button"
                    className="consult-btn consult-btn--icon"
                    onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                    disabled={lines.length <= 1}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                )}
              </div>
            ))}
            <div className="estimate-line estimate-line--total">
              <span>Estimated Total</span>
              <span />
              <span />
              <span className="estimate-line-total">{peso(subtotal)}</span>
              {editable && <span />}
            </div>
          </div>

          <div className="estimate-actions">
            {editable && (
              <>
                <button
                  type="button"
                  className="consult-btn consult-btn--secondary consult-btn--sm"
                  onClick={() => setLines((prev) => [...prev, emptyLine()])}
                >
                  <FontAwesomeIcon icon={faPlus} /> Add Line
                </button>
                <button
                  type="button"
                  className="consult-btn consult-btn--secondary"
                  onClick={saveDraft}
                  disabled={busy}
                >
                  <FontAwesomeIcon icon={faSave} /> Save Estimate
                </button>
              </>
            )}
            {estimate && ["draft", "changes_requested"].includes(status) && (
              <button
                type="button"
                className="consult-btn consult-btn--secondary"
                disabled={busy}
                onClick={() =>
                  act(
                    () =>
                      apiRequest(
                        `/veterinary/appointments/${appointmentId}/estimate/present`,
                        "POST",
                        {}
                      ),
                    "Estimate presented to the customer."
                  )
                }
              >
                <FontAwesomeIcon icon={faPaperPlane} /> Present to Customer
              </button>
            )}
            {estimate && ["presented", "draft", "changes_requested"].includes(status) && (
              <button
                type="button"
                className="consult-btn consult-btn--primary"
                disabled={busy}
                onClick={() =>
                  act(
                    () =>
                      apiRequest(
                        `/veterinary/appointments/${appointmentId}/estimate/approve`,
                        "POST",
                        {}
                      ),
                    "Estimate approved at the counter."
                  )
                }
              >
                <FontAwesomeIcon icon={faCircleCheck} /> Approve at Counter
              </button>
            )}
          </div>
          {status === "approved" && (
            <p className="estimate-approved-note">
              Approved {estimate.channel === "portal" ? "by the customer via the portal" : "at the counter"}
              {estimate.approved_at
                ? ` · ${new Date(estimate.approved_at).toLocaleString()}`
                : ""}
              . Further charges beyond{" "}
              {peso(
                (estimate.approved_total || 0) *
                  (1 + (estimate.threshold_percent || 0) / 100)
              )}{" "}
              will require re-approval.
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default VetEstimatePanel;
