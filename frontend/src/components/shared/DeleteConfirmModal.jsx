import React, { useState } from "react";
import "./DeleteConfirmModal.css";
import { showAlert } from "../../utils/alert.jsx";

const DeleteConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  loading,
  itemName = "this item",
  requireReason = false,
}) => {
  const [reason, setReason] = useState("");

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (requireReason && !reason.trim()) {
      showAlert("Please provide a reason for deletion.");
      return;
    }
    onConfirm(reason);
  };

  return (
    <div className="delete-modal-overlay" onClick={onClose}>
      <div
        className="delete-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="delete-modal-header">
          <div className="delete-icon">🗑</div>
          <h3>Delete Product</h3>
        </div>

        <div className="delete-modal-body">
          <p>
            Are you sure you want to delete{" "}
            <strong>{itemName}</strong>?
          </p>
          <span>This action cannot be undone.</span>

          {requireReason && (
            <div className="delete-reason-input">
              <label>Reason for deletion *</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Please explain why you need to delete this product..."
                rows="3"
              />
            </div>
          )}
        </div>

        <div className="delete-modal-footer">
          <button
            className="btn-cancel"
            onClick={() => {
              setReason("");
              onClose();
            }}
            disabled={loading}
          >
            Cancel
          </button>

          <button
            className="btn-delete"
            onClick={handleConfirm}
            disabled={loading || (requireReason && !reason.trim())}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
