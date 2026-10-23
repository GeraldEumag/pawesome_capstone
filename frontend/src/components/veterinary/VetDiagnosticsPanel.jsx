import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faFlaskVial,
  faMicroscope,
  faPlus,
  faSpinner,
  faVialCircleCheck,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";

const STATUS_LABELS = {
  ordered: "Ordered",
  collected: "Collected",
  resulted: "Resulted",
  reviewed: "Reviewed",
  cancelled: "Cancelled",
};

/**
 * Diagnostic orders for a visit: vet places and reviews them; vet techs
 * collect specimens and enter results (with optional attachments).
 */
const VetDiagnosticsPanel = ({ appointmentId, disabled, canOrder }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    order_type: "lab",
    priority: "routine",
    notes: "",
    charge_price: "",
  });
  const [resultFor, setResultFor] = useState(null);
  const [resultForm, setResultForm] = useState({ findings: "", is_abnormal: false, attachment: null });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiRequest(`/veterinary/appointments/${appointmentId}/diagnostics`);
      setOrders(Array.isArray(res?.orders) ? res.orders : []);
    } catch (err) {
      toast.error(err.message || "Failed to load diagnostic orders.");
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn, successMsg) => {
    try {
      setBusy(true);
      await fn();
      if (successMsg) toast.success(successMsg);
      await load();
    } catch (err) {
      toast.error(err.message || "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const placeOrder = () =>
    act(async () => {
      if (!form.name.trim()) throw new Error("Order name is required.");
      await apiRequest(`/veterinary/appointments/${appointmentId}/diagnostics`, "POST", {
        name: form.name.trim(),
        order_type: form.order_type,
        priority: form.priority,
        notes: form.notes || undefined,
        charge_price: form.charge_price === "" ? undefined : Number(form.charge_price),
      });
      setForm({ name: "", order_type: "lab", priority: "routine", notes: "", charge_price: "" });
      setShowForm(false);
    }, "Diagnostic order placed.");

  const submitResult = (orderId) =>
    act(async () => {
      if (!resultForm.findings.trim() && !resultForm.attachment) {
        throw new Error("Enter findings or attach a result file.");
      }
      const fd = new FormData();
      fd.append("findings", resultForm.findings);
      fd.append("is_abnormal", resultForm.is_abnormal ? "1" : "0");
      if (resultForm.attachment) fd.append("attachment", resultForm.attachment);
      await apiRequest(`/veterinary/diagnostics/${orderId}/result`, "POST", fd);
      setResultFor(null);
      setResultForm({ findings: "", is_abnormal: false, attachment: null });
    }, "Result recorded.");

  return (
    <div className="consult-section-card">
      <div className="consult-section-header">
        <div className="consult-section-icon">
          <FontAwesomeIcon icon={faMicroscope} />
        </div>
        <div className="consult-section-title-group">
          <h3>Diagnostic Orders</h3>
          <p>Labs and imaging — ordered → collected → resulted → reviewed</p>
        </div>
        {canOrder && !disabled && (
          <button
            type="button"
            className="consult-btn consult-btn--secondary consult-btn--sm"
            onClick={() => setShowForm((v) => !v)}
          >
            <FontAwesomeIcon icon={faPlus} /> Order Test
          </button>
        )}
      </div>

      {showForm && canOrder && !disabled && (
        <div className="consult-form dx-order-form">
          <div className="dx-order-grid">
            <label className="consult-label">
              Test / Order
              <input
                type="text"
                value={form.name}
                placeholder="e.g. CBC panel, X-ray thorax…"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="consult-label">
              Type
              <select
                value={form.order_type}
                onChange={(e) => setForm((f) => ({ ...f, order_type: e.target.value }))}
              >
                <option value="lab">Lab</option>
                <option value="imaging">Imaging</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="consult-label">
              Priority
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              >
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="stat">STAT</option>
              </select>
            </label>
            <label className="consult-label">
              Charge (optional)
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.charge_price}
                onChange={(e) => setForm((f) => ({ ...f, charge_price: e.target.value }))}
              />
            </label>
          </div>
          <label className="consult-label consult-label--full">
            Notes
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Clinical notes for the lab…"
            />
          </label>
          <button
            type="button"
            className="consult-btn consult-btn--primary"
            onClick={placeOrder}
            disabled={busy}
          >
            {busy ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faFlaskVial} />}
            Place Order
          </button>
        </div>
      )}

      {loading ? (
        <div className="consult-rx-empty">
          <FontAwesomeIcon icon={faSpinner} spin /> Loading orders…
        </div>
      ) : orders.length === 0 ? (
        <div className="consult-rx-empty">No diagnostic orders for this visit.</div>
      ) : (
        <ul className="dx-order-list">
          {orders.map((order) => (
            <li key={order.id} className="dx-order">
              <div className="dx-order-head">
                <div>
                  <strong>{order.name}</strong>
                  <small>
                    {order.code} · {order.order_type} · {order.priority}
                  </small>
                </div>
                <span className={`consult-apt-badge dx-badge--${order.status}`}>
                  {STATUS_LABELS[order.status] || order.status}
                </span>
              </div>

              {order.results?.length > 0 && (
                <div className="dx-result">
                  <strong>Latest result</strong>
                  <p>{order.results[order.results.length - 1].findings || "(attachment only)"}</p>
                  {order.results[order.results.length - 1].is_abnormal && (
                    <span className="dx-abnormal">Abnormal findings</span>
                  )}
                </div>
              )}

              <div className="dx-actions">
                {order.status === "ordered" && !disabled && (
                  <button
                    type="button"
                    className="consult-btn consult-btn--secondary consult-btn--sm"
                    disabled={busy}
                    onClick={() =>
                      act(
                        () => apiRequest(`/veterinary/diagnostics/${order.id}/collect`, "POST", {}),
                        "Specimen collected."
                      )
                    }
                  >
                    <FontAwesomeIcon icon={faVialCircleCheck} /> Mark Collected
                  </button>
                )}
                {["ordered", "collected"].includes(order.status) && !disabled && (
                  <button
                    type="button"
                    className="consult-btn consult-btn--secondary consult-btn--sm"
                    disabled={busy}
                    onClick={() => setResultFor(resultFor === order.id ? null : order.id)}
                  >
                    <FontAwesomeIcon icon={faFlaskVial} /> Enter Result
                  </button>
                )}
                {order.status === "resulted" && canOrder && !disabled && (
                  <button
                    type="button"
                    className="consult-btn consult-btn--primary consult-btn--sm"
                    disabled={busy}
                    onClick={() =>
                      act(
                        () => apiRequest(`/veterinary/diagnostics/${order.id}/review`, "POST", {}),
                        "Result reviewed."
                      )
                    }
                  >
                    <FontAwesomeIcon icon={faCircleCheck} /> Mark Reviewed
                  </button>
                )}
              </div>

              {resultFor === order.id && (
                <div className="dx-result-form">
                  <label className="consult-label consult-label--full">
                    Findings
                    <textarea
                      value={resultForm.findings}
                      onChange={(e) =>
                        setResultForm((f) => ({ ...f, findings: e.target.value }))
                      }
                      placeholder="Result summary / findings…"
                    />
                  </label>
                  <div className="dx-result-row">
                    <label className="dx-check">
                      <input
                        type="checkbox"
                        checked={resultForm.is_abnormal}
                        onChange={(e) =>
                          setResultForm((f) => ({ ...f, is_abnormal: e.target.checked }))
                        }
                      />
                      Abnormal result
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) =>
                        setResultForm((f) => ({ ...f, attachment: e.target.files?.[0] || null }))
                      }
                    />
                    <button
                      type="button"
                      className="consult-btn consult-btn--primary consult-btn--sm"
                      disabled={busy}
                      onClick={() => submitResult(order.id)}
                    >
                      {busy ? <FontAwesomeIcon icon={faSpinner} spin /> : null}
                      Save Result
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default VetDiagnosticsPanel;
