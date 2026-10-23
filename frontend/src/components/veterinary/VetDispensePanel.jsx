import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPrescriptionBottleMedical,
  faPlus,
  faSpinner,
  faCommentMedical,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";

/**
 * Take-home medication dispensing for a visit. Stock moves on Dispense;
 * controlled drugs additionally write the register entry server-side.
 */
const VetDispensePanel = ({ appointmentId, disabled }) => {
  const [dispensations, setDispensations] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    inventory_item_id: "",
    quantity: 1,
    label_text: "",
    directions: "",
  });

  const load = useCallback(async () => {
    try {
      const [disp, inv] = await Promise.all([
        apiRequest(`/veterinary/dispensations?appointment_id=${appointmentId}`),
        apiRequest("/veterinary/inventory-items"),
      ]);
      setDispensations(Array.isArray(disp?.dispensations) ? disp.dispensations : []);
      const list = Array.isArray(inv) ? inv : (inv?.items || inv?.inventory_items || inv?.data || []);
      // Only pharmacy-relevant classes can be dispensed.
      setItems(list.filter((i) => !i.item_class || ["medicine", "vaccine", "controlled_drug", "consumable", "retail"].includes(i.item_class)));
    } catch (err) {
      toast.error(err.message || "Failed to load dispensations.");
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => { load(); }, [load]);

  const dispense = async () => {
    if (!form.inventory_item_id) {
      toast.error("Pick a medication item.");
      return;
    }
    try {
      setBusy(true);
      await apiRequest("/veterinary/dispensations", "POST", {
        appointment_id: appointmentId,
        inventory_item_id: Number(form.inventory_item_id),
        quantity: Number(form.quantity) || 1,
        label_text: form.label_text || undefined,
        directions: form.directions || undefined,
      });
      toast.success("Medication dispensed — stock deducted.");
      setShowForm(false);
      setForm({ inventory_item_id: "", quantity: 1, label_text: "", directions: "" });
      await load();
    } catch (err) {
      toast.error(err.message || "Dispense failed.");
    } finally {
      setBusy(false);
    }
  };

  const counsel = async (id) => {
    try {
      setBusy(true);
      await apiRequest(`/veterinary/dispensations/${id}/counsel`, "POST");
      toast.success("Marked as counselled.");
      await load();
    } catch (err) {
      toast.error(err.message || "Failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="consult-section-card">
      <div className="consult-section-header">
        <div className="consult-section-icon consult-section-icon--primary">
          <FontAwesomeIcon icon={faPrescriptionBottleMedical} />
        </div>
        <div>
          <h3>Dispensing</h3>
          <p className="consult-section-sub">Take-home medication — stock deducts on dispense.</p>
        </div>
        {!disabled && (
          <button type="button" className="consult-mini-btn" onClick={() => setShowForm((v) => !v)}>
            <FontAwesomeIcon icon={faPlus} /> Dispense
          </button>
        )}
      </div>

      {showForm && !disabled && (
        <div className="consult-panel-form">
          <div className="consult-form-row">
            <label>Medication</label>
            <select
              value={form.inventory_item_id}
              onChange={(e) => setForm((f) => ({ ...f, inventory_item_id: e.target.value }))}
            >
              <option value="">Select item…</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}{item.item_class === "controlled_drug" ? " ⚠ controlled" : ""} — stock {item.stock ?? item.available_stock ?? 0}
                </option>
              ))}
            </select>
          </div>
          <div className="consult-form-row">
            <label>Quantity</label>
            <input
              type="number"
              min="1"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
            />
          </div>
          <div className="consult-form-row">
            <label>Label text</label>
            <input
              type="text"
              placeholder="Give 1 tablet twice daily with food"
              value={form.label_text}
              onChange={(e) => setForm((f) => ({ ...f, label_text: e.target.value }))}
            />
          </div>
          <div className="consult-form-row">
            <label>Directions</label>
            <textarea
              rows="2"
              value={form.directions}
              onChange={(e) => setForm((f) => ({ ...f, directions: e.target.value }))}
            />
          </div>
          <button type="button" className="consult-mini-btn consult-mini-btn--primary" onClick={dispense} disabled={busy}>
            {busy ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faPrescriptionBottleMedical} />}
            Confirm Dispense
          </button>
        </div>
      )}

      {loading ? (
        <p className="consult-panel-empty"><FontAwesomeIcon icon={faSpinner} spin /> Loading…</p>
      ) : dispensations.length === 0 ? (
        <p className="consult-panel-empty">No medications dispensed this visit.</p>
      ) : (
        <ul className="consult-panel-list">
          {dispensations.map((d) => (
            <li key={d.id} className="consult-panel-item">
              <div>
                <strong>{d.item?.name || `Item #${d.inventory_item_id}`}</strong>
                <span>
                  {" "}— {d.quantity} {d.unit}
                  {d.batch?.batch_no ? ` • batch ${d.batch.batch_no}` : ""}
                  {d.dispensed_by?.name ? ` • by ${d.dispensed_by.name}` : ""}
                </span>
                {d.label_text && <p className="consult-panel-note">{d.label_text}</p>}
              </div>
              {d.counselled_at ? (
                <span className="consult-badge consult-badge--done">Counselled</span>
              ) : (
                !disabled && (
                  <button type="button" className="consult-mini-btn" onClick={() => counsel(d.id)} disabled={busy}>
                    <FontAwesomeIcon icon={faCommentMedical} /> Counsel
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default VetDispensePanel;
