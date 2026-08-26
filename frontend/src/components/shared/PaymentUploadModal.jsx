import { useState } from "react";
import gcashQr from "../../assets/PAWESOME TEST GCASH.png";
import { apiRequest } from "../../api/client";
import { showSuccess, showError } from "../../utils/alert.jsx";
import "./PaymentUploadModal.css";

const PaymentUploadModal = ({ open, onClose, onSuccess, endpoint, title }) => {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const allowed = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowed.includes(selected.type)) {
      setError("Please upload a JPG or PNG image only.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setError("");
  };

  const handleClose = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setReferenceNumber("");
    setError("");
    onClose();
  };

  const handleConfirm = async () => {
    if (!file || !referenceNumber.trim() || uploading) return;

    const formData = new FormData();
    formData.append("payment_proof", file);
    formData.append("payment_reference", referenceNumber.trim());
    formData.append("payment_method", "GCash");

    setUploading(true);
    setError("");

    try {
      await apiRequest(endpoint, "POST", formData);
      showSuccess("Payment proof uploaded. Awaiting cashier verification.");
      handleClose();
      onSuccess?.();
    } catch (err) {
      const msg = err.message || "Failed to upload payment proof.";
      setError(msg);
      showError(msg);
    } finally {
      setUploading(false);
    }
  };

  const canConfirm = !!file && referenceNumber.trim().length > 0 && !uploading;

  return (
    <div className="pum-overlay" onClick={handleClose}>
      <div className="pum-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pum-header">
          <h3 className="pum-title">GCash Payment — {title}</h3>
          <button
            type="button"
            className="pum-close"
            onClick={handleClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="pum-body">
          <div className="pum-qr-section">
            <img src={gcashQr} alt="GCash QR Code" className="pum-qr-img" />
            <p className="pum-gcash-number">GCash No: 0917 123 4567</p>
            <p className="pum-instruction">
              Scan the QR code or send to the number above, then upload your screenshot below.
            </p>
          </div>

          <div className="pum-step">
            <p className="pum-step-label">
              <span className="pum-step-number">1</span>
              Select receipt photo <span className="pum-required">(JPG or PNG only)</span>
            </p>
            <label className="pum-file-label" htmlFor="pum-file-input">
              {file ? `📎 ${file.name}` : "Choose File"}
            </label>
            <input
              id="pum-file-input"
              type="file"
              accept="image/jpeg,image/png,image/jpg"
              className="pum-file-input"
              onChange={handleFileChange}
            />
            {previewUrl && (
              <div className="pum-preview">
                <img
                  src={previewUrl}
                  alt="Receipt preview"
                  className="pum-preview-img"
                />
              </div>
            )}
          </div>

          <div className="pum-step">
            <p className="pum-step-label">
              <span className="pum-step-number">2</span>
              Enter your GCash reference number
            </p>
            <input
              type="text"
              className="pum-ref-input"
              placeholder="e.g. 1234567890"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
            />
          </div>

          {error && <p className="pum-error">{error}</p>}
        </div>

        <div className="pum-footer">
          <button
            type="button"
            className="pum-cancel-btn"
            onClick={handleClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="pum-confirm-btn"
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            {uploading ? "Uploading…" : "Confirm & Upload"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentUploadModal;
