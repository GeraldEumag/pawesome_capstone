import React, { useEffect, useState } from "react";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import "./DeleteConfirmModal.css";
import { showAlert } from "../../utils/alert.jsx";
import Modal from "./Modal";

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={faTrash}
      size="sm"
      className="delete-modal"
      footer={
        <>
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
        </>
      }
    >
      <div className="delete-modal-body">
        <p>{message || <>Are you sure you want to delete <strong>{itemName}</strong>?</>}</p>
        {warningText && <span className="delete-warning">{warningText}</span>}

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
    </Modal>
  );
};

export default DeleteConfirmModal;
