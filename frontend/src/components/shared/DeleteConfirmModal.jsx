import React, { useEffect, useState } from "react";
import "./DeleteConfirmModal.css";
import { showAlert } from "../../utils/alert.jsx";

const DeleteConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  loading,
  itemName = "this item",
  title = "Delete Product",
  message,
  warningText = "This action cannot be undone.",
  confirmText = "Delete",
  loadingText = "Deleting...",
  requireReason = false,
  reasonOptions = [],
  reasonLabel = "Reason *",
  reasonDetailsLabel = "Additional details *",
  reasonDetailsPlaceholder = "Please provide more detail...",
}) => {
  const [reason, setReason] = useState("");
  const [reasonDetails, setReasonDetails] = useState("");

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setReasonDetails("");
    }
  }, [isOpen, itemName]);

  if (!isOpen) return null;

  const needsDetails = reason === "other";
  const hasReasonOptions = reasonOptions.length > 0;

  const handleConfirm = () => {
    if (requireReason && !reason.trim()) {
      showAlert("Please select a reason.");
      return;
    }
    if (requireReason && needsDetails && !reasonDetails.trim()) {
      showAlert("Please provide details for the selected reason.");
      return;
    }
    onConfirm(reason, reasonDetails);
  };

  return (
    <div className="delete-modal-overlay" onClick={onClose}>
      <div
        className="delete-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="delete-modal-header">
          <div className="delete-icon">🗑</div>
          <h3>{title}</h3>
        </div>

        <div className="delete-modal-body">
          <p>{message || <>Are you sure you want to delete <strong>{itemName}</strong>?</>}</p>
          {warningText && <span>{warningText}</span>}

          {requireReason && (
            <div className="delete-reason-input">
              <label htmlFor="inventory-action-reason">{reasonLabel}</label>
              {hasReasonOptions ? (
                <select
                  id="inventory-action-reason"
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    if (event.target.value !== "other") setReasonDetails("");
                  }}
                >
                  <option value="">Select a reason...</option>
                  {reasonOptions.map((option) => {
                    const value = typeof option === "string" ? option : option.value;
                    const label = typeof option === "string" ? option : option.label;
                    return <option key={value} value={value}>{label}</option>;
                  })}
                </select>
              ) : (
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={reasonDetailsPlaceholder}
                  rows="3"
                />
              )}
              {needsDetails && (
                <>
                  <label htmlFor="inventory-action-reason-details">{reasonDetailsLabel}</label>
                  <textarea
                    id="inventory-action-reason-details"
                    value={reasonDetails}
                    onChange={(e) => setReasonDetails(e.target.value)}
                    placeholder={reasonDetailsPlaceholder}
                    rows="3"
                  />
                </>
              )}
            </div>
          )}
        </div>

        <div className="delete-modal-footer">
          <button
            className="btn-cancel"
            onClick={() => {
              setReason("");
              setReasonDetails("");
              onClose();
            }}
            disabled={loading}
          >
            Cancel
          </button>

          <button
            className="btn-delete"
            onClick={handleConfirm}
            disabled={loading || (requireReason && (!reason.trim() || (needsDetails && !reasonDetails.trim())))}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                {loadingText}
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
