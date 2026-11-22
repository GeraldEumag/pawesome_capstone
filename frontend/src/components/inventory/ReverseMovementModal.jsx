import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { inventoryApi } from "../../api/inventory.jsx";
import { showError } from "../../utils/alert.jsx";
import Modal from "../shared/Modal";

const newIdemKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `rev-${Date.now()}`;

/**
 * Reversal dialog for a reversible movement log. Creates a new linked
 * stock_reversal movement — never deletes the original record.
 */
const ReverseMovementModal = ({ movement, onClose, onDone }) => {
  const [quantity, setQuantity] = useState(movement?.remaining_reversible || 1);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!movement) return null;
  const remaining = movement.remaining_reversible ?? 0;
  const restoring = (movement.delta ?? -Math.abs(movement.quantity ?? 0)) < 0;

  const submit = async () => {
    const q = parseInt(quantity, 10);
    if (!q || q <= 0) { showError("Quantity must be greater than zero.", "Reverse Movement"); return; }
    if (q > remaining) { showError(`Only ${remaining} unit(s) remain reversible.`, "Reverse Movement"); return; }
    if (!reason.trim()) { showError("A reversal reason is required.", "Reverse Movement"); return; }
    setSubmitting(true);
    try {
      const res = await inventoryApi.reverseMovement(
        movement.id,
        { quantity: q, reason: reason.trim() },
        { headers: { "Idempotency-Key": newIdemKey() } }
      );
      onDone?.(res);
      onClose();
    } catch (err) {
      showError(err.message, "Reverse Movement");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={() => !submitting && onClose()}
      title={`Reverse Movement #${movement.id}`}
      subtitle={`${movement.item_name || "Item"} · ${movement.movement_type} · ${movement.transaction_no || "no transaction"}`}
      icon={faRotateLeft}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? "Reversing…" : restoring ? "Restore Stock" : "Remove Stock"}
          </button>
        </>
      }
    >
      <div className="sm-reversal-info">
        <div className="sm-info-box">
          <div className="num">{movement.quantity}</div>
          <div className="lbl">Original qty</div>
        </div>
        <div className="sm-info-box">
          <div className="num">{movement.reversed_quantity || 0}</div>
          <div className="lbl">Already reversed</div>
        </div>
        <div className="sm-info-box">
          <div className="num">{remaining}</div>
          <div className="lbl">Remaining reversible</div>
        </div>
      </div>

      <div className="sm-form-grid">
        <div className="sm-field">
          <label>Quantity to reverse *</label>
          <input type="number" min="1" max={remaining} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <span className="sm-helper">
            {restoring
              ? "Units are added back to sellable stock as a linked stock-reversal movement."
              : "Units are removed from stock as a linked stock-reversal movement."}
          </span>
        </div>
        <div className="sm-field sm-full">
          <label>Reversal reason *</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this movement being reversed?" />
        </div>
      </div>
    </Modal>
  );
};

export default ReverseMovementModal;
