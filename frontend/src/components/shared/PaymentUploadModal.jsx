import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import gcashQr from "../../assets/PAWESOME TEST GCASH.png";
import { apiRequest } from "../../api/client";
import { showSuccess, showError } from "../../utils/alert.jsx";
import "./PaymentUploadModal.css";

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash", hint: "Pay at the counter" },
  { value: "gcash", label: "GCash", hint: "Scan QR or send via app" },
  { value: "maya", label: "Maya", hint: "Send via Maya app" },
];

const PaymentUploadModal = ({ open, onClose, onSuccess, endpoint, title }) => {
  const [paymentMethod, setPaymentMethod] = useState("gcash");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const isCash = paymentMethod === "cash";

  // Lock body scroll when modal opens
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
      document.body.style.top = "0";
    } else {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.top = "";
    }

    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.top = "";
    };
  }, [open]);

  if (!open) return null;

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const allowed = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];
    if (!allowed.includes(selected.type)) {
      setError("Please upload a JPG, PNG image, or PDF only.");
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (selected.size > maxSize) {
      setError("File size must be less than 5MB.");
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
    setPaymentMethod("gcash");
    setError("");
    onClose();
  };

  const handleConfirm = async () => {
    if (uploading) return;
    if (!isCash && (!file || !referenceNumber.trim())) return;

    const formData = new FormData();
    formData.append("payment_method", paymentMethod);
    if (!isCash) {
      formData.append("payment_proof", file);
      formData.append("payment_reference", referenceNumber.trim());
    }

    setUploading(true);
    setError("");

    try {
      await apiRequest(endpoint, "POST", formData);
      showSuccess(
        isCash
          ? "Cash payment recorded. Please pay at the counter — the cashier will verify it."
          : "Payment proof uploaded. Awaiting cashier verification."
      );
      handleClose();
      onSuccess?.();
    } catch (err) {
      const msg = err.message || "Failed to submit payment.";
      setError(msg);
      showError(msg);
    } finally {
      setUploading(false);
    }
  };

  const canConfirm = isCash
    ? !uploading
    : !!file && referenceNumber.trim().length > 0 && !uploading;

  return createPortal(
    <div className="pum-overlay" onClick={handleClose}>
      <div className="pum-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pum-header">
          <h3 className="pum-title">Payment — {title}</h3>
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
          <div className="pum-step">
            <p className="pum-step-label">
              <span className="pum-step-number">1</span>
              Choose payment method
            </p>
            <div className="pum-methods">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method.value}
                  type="button"
                  className={`pum-method-btn${paymentMethod === method.value ? " active" : ""}`}
                  onClick={() => {
                    setPaymentMethod(method.value);
                    setError("");
                  }}
                >
                  <span className="pum-method-label">{method.label}</span>
                  <span className="pum-method-hint">{method.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {isCash ? (
            <div className="pum-qr-section">
              <div className="pum-cash-panel">
                <p className="pum-cash-title">Pay at the front desk</p>
                <p className="pum-instruction">
                  No upload needed. Confirm below, then pay in cash at the store
                  counter — the cashier will verify and mark this as paid.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="pum-qr-section">
                {paymentMethod === "gcash" ? (
                  <img src={gcashQr} alt="GCash QR Code" className="pum-qr-img" />
                ) : (
                  <div className="pum-maya-badge">Maya</div>
                )}
                <p className="pum-gcash-number">
                  {paymentMethod === "gcash" ? "GCash" : "Maya"} No: 0917 123 4567
                </p>
                <p className="pum-instruction">
                  {paymentMethod === "gcash"
                    ? "Scan the QR code or send to the number above, then upload your screenshot below."
                    : "Send to the Maya number above, then upload your screenshot below."}
                </p>
              </div>

              <div className="pum-step">
                <p className="pum-step-label">
                  <span className="pum-step-number">2</span>
                  Select receipt photo <span className="pum-required">(JPG, PNG, or PDF only, max 5MB)</span>
                </p>
                <label className="pum-file-label" htmlFor="pum-file-input">
                  {file ? `📎 ${file.name}` : "Choose File"}
                </label>
                <input
                  id="pum-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/jpg,application/pdf"
                  className="pum-file-input"
                  onChange={handleFileChange}
                />
                {previewUrl && (
                  <div className="pum-preview">
                    {file.type === "application/pdf" ? (
                      <div className="pum-preview-pdf">
                        <span>📄 PDF Document</span>
                        <span>{file.name}</span>
                      </div>
                    ) : (
                      <img
                        src={previewUrl}
                        alt="Receipt preview"
                        className="pum-preview-img"
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="pum-step">
                <p className="pum-step-label">
                  <span className="pum-step-number">3</span>
                  Enter your {paymentMethod === "gcash" ? "GCash" : "Maya"} reference number
                </p>
                <input
                  type="text"
                  className="pum-ref-input"
                  placeholder="e.g. 1234567890"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                />
              </div>
            </>
          )}

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
            {uploading
              ? "Submitting…"
              : isCash
                ? "Confirm Cash Payment"
                : "Confirm & Upload"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PaymentUploadModal;
