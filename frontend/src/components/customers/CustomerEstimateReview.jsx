import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";

const peso = (n) =>
  `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_COPY = {
  presented: "Your veterinarian prepared this estimate for your approval.",
  changes_requested:
    "Projected charges exceeded the approved estimate — please review the updated amount.",
};

/**
 * Pending visit estimates awaiting the owner's decision. Approving unlocks
 * treatment charges on the visit; rejecting flags the estimate for revision.
 */
const CustomerEstimateReview = () => {
  const [estimates, setEstimates] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest("/customer/estimates/pending");
      setEstimates(Array.isArray(res?.estimates) ? res.estimates : []);
    } catch {
      // Non-blocking — the payments list still renders without estimates.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (estimate, action) => {
    try {
      setBusy(`${estimate.id}:${action}`);
      await apiRequest(
        `/customer/appointments/${estimate.appointment_id}/estimate/${action}`,
        "POST",
        {}
      );
      toast.success(
        action === "approve"
          ? "Estimate approved — treatment can proceed."
          : "Estimate rejected — the clinic will revise it."
      );
      await load();
    } catch (err) {
      toast.error(err.message || "Unable to update the estimate.");
    } finally {
      setBusy(null);
    }
  };

  if (estimates.length === 0) return null;

  return (
    <div className="estimate-review-list">
      {estimates.map((estimate) => (
        <div className="estimate-review-card" key={estimate.id}>
          <div className="estimate-review-head">
            <strong>
              Treatment Estimate
              {estimate.version > 1 ? ` · Revision ${estimate.version}` : ""}
            </strong>
            <span className="estimate-review-total">{peso(estimate.subtotal)}</span>
          </div>
          <p className="estimate-review-copy">
            {STATUS_COPY[estimate.status] || "Please review this estimate."}
          </p>
          <ul className="estimate-review-lines">
            {(estimate.lines || []).map((line) => (
              <li key={line.id}>
                <span>
                  {line.description}
                  {line.quantity > 1 ? ` ×${line.quantity}` : ""}
                </span>
                <span>{peso(line.line_total)}</span>
              </li>
            ))}
          </ul>
          <div className="estimate-review-actions">
            <button
              type="button"
              className="estimate-btn estimate-btn--approve"
              disabled={busy !== null}
              onClick={() => decide(estimate, "approve")}
            >
              Approve Estimate
            </button>
            <button
              type="button"
              className="estimate-btn estimate-btn--reject"
              disabled={busy !== null}
              onClick={() => decide(estimate, "reject")}
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CustomerEstimateReview;
