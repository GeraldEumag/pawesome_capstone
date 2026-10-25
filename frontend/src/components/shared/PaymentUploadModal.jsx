import { useState, useEffect } from "react";
import gcashQr from "../../assets/PAWESOME TEST GCASH.png";
import { apiRequest } from "../../api/client";
import { showSuccess, showError } from "../../utils/alert.jsx";
import Modal from "./Modal";
import "./PaymentUploadModal.css";

const PAYMENT_METHODS = [
  { value: "gcash", label: "GCash", hint: "Scan QR or send via app" },
  { value: "maya", label: "Maya", hint: "Send via Maya app" },
];

// Rough sharpness estimate (variance of pixel gradients on a downscaled
// canvas). Non-blocking — only warns when a photo looks too blurry to scan.
const estimateSharpness = (imageUrl) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let sum = 0;
        let count = 0;
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size - 1; x += 1) {
            const i = (y * size + x) * 4;
            const a = (data[i] + data[i + 1] + data[i + 2]) / 3;
            const b = (data[i + 4] + data[i + 5] + data[i + 6]) / 3;
            sum += Math.abs(a - b);
            count += 1;
          }
        }
        resolve(count > 0 ? sum / count : 0);
      } catch {
        resolve(999); // can't measure — don't warn
      }
    };
    img.onerror = () => resolve(999);
    img.src = imageUrl;
  });

const MAX_SCAN_POLLS = 20;

const PaymentUploadModal = ({ open, onClose, onSuccess, endpoint, title, referenceNumber: previousReference = "", paymentStatus = "", rejectionReason = "", paymentMethod: previousPaymentMethod = "gcash", amount = null, awaitingBookingApproval = false }) => {
  const [paymentMethod, setPaymentMethod] = useState("gcash");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [blurWarning, setBlurWarning] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [scan, setScan] = useState(null);
  const [manualRef, setManualRef] = useState("");
  const [submittingManualRef, setSubmittingManualRef] = useState(false);

  const isRejected = String(paymentStatus).toLowerCase() === "rejected";

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setPreviewUrl(null);
    setReferenceNumber("");
    setBlurWarning(false);
    const method = String(previousPaymentMethod || "").toLowerCase();
    setPaymentMethod(PAYMENT_METHODS.some((option) => option.value === method) ? method : "gcash");
    setError("");
    setScan(null);
    setManualRef("");
    setSubmittingManualRef(false);
  }, [open, endpoint, previousPaymentMethod]);

  // Poll the scan status after a scanner-enabled upload until the receipt is
  // read (or the poll budget runs out). Server-side processing continues even
  // if the modal is closed early.
  useEffect(() => {
    if (!open || !scan?.pollUrl || scan.done) return undefined;
    let cancelled = false;
    const delay = scan.attempts === 0 ? 1200 : 2500;
    const timer = setTimeout(async () => {
      let r = null;
      try {
        const data = await apiRequest(scan.pollUrl);
        r = data?.receipt || null;
      } catch {
        // transient poll failure — keep polling until the budget runs out
      }
      if (cancelled) return;
      setScan((prev) => {
        if (!prev) return prev;
        const attempts = prev.attempts + 1;
        const stillReading = !r || r.display_status === "reading";
        return {
          ...prev,
          attempts,
          receiptId: r?.id ?? prev.receiptId,
          displayStatus: r?.display_status ?? "reading",
          scannedReference: r?.scanned_reference ?? null,
          needsManual: !!r?.needs_manual_reference,
          rejectReason: r?.reject_reason ?? null,
          done: !stillReading || attempts >= MAX_SCAN_POLLS,
          timedOut: stillReading && attempts >= MAX_SCAN_POLLS,
        };
      });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, scan]);

  if (!open) return null;

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(selected.type)) {
      setError("Please upload a JPG, PNG, or WEBP image, or a PDF only.");
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (selected.size > maxSize) {
      setError("File size must be less than 5MB.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const objectUrl = URL.createObjectURL(selected);
    setFile(selected);
    setPreviewUrl(objectUrl);
    setIdempotencyKey(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "");
    setError("");
    setBlurWarning(false);

    if (selected.type !== "application/pdf") {
      estimateSharpness(objectUrl).then((score) => setBlurWarning(score < 8));
    }
  };

  const handleClose = () => {
    const wasScanning = !!scan;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setReferenceNumber("");
    setPaymentMethod("gcash");
    setError("");
    setScan(null);
    onClose();
    if (wasScanning) onSuccess?.();
  };

  const handleConfirm = async () => {
    if (uploading) return;
    if (!file) return;

    const formData = new FormData();
    formData.append("payment_method", paymentMethod);
    formData.append("payment_proof", file);
    if (referenceNumber.trim()) {
      formData.append("payment_reference", referenceNumber.trim());
    }
    if (idempotencyKey) {
      formData.append("idempotency_key", idempotencyKey);
    }

    setUploading(true);
    setError("");

    try {
      const data = await apiRequest(endpoint, "POST", formData);
      if (data?.receipt_poll) {
        setScan({
          pollUrl: data.receipt_poll,
          attempts: 0,
          done: false,
          timedOut: false,
          receiptId: null,
          displayStatus: "reading",
          scannedReference: null,
          needsManual: false,
          rejectReason: null,
        });
        return;
      }
      showSuccess(awaitingBookingApproval
        ? "Payment proof received. Cashier verification will begin after the booking is approved."
        : "Payment submitted. The cashier will verify it shortly.");
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

  const handleSubmitManualRef = async () => {
    if (!manualRef.trim() || submittingManualRef || !scan?.receiptId) return;
    setSubmittingManualRef(true);
    setError("");
    try {
      await apiRequest(`/customer/receipts/${scan.receiptId}/reference`, "POST", { reference: manualRef.trim() });
      setScan((prev) => (prev ? { ...prev, displayStatus: "under_review", needsManual: false } : prev));
    } catch (err) {
      setError(err.message || "Could not submit the reference.");
    } finally {
      setSubmittingManualRef(false);
    }
  };

  const canConfirm = !!file && !uploading;

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title={`Payment — ${title}`}
      size="md"
      className="pum-modal"
      footer={scan ? (
        <button
          type="button"
          className="pum-confirm-btn"
          onClick={handleClose}
        >
          {scan.done ? "Done" : "Close"}
        </button>
      ) : (
        <>
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
            {uploading ? "Submitting…" : "Confirm & Upload"}
          </button>
        </>
      )}
    >
      {scan ? (
        <div className="pum-body">
          <div className={`pum-scan-panel pum-scan-${scan.displayStatus}`} role="status">
            {scan.displayStatus === "reading" && !scan.timedOut && (
              <>
                <div className="pum-scan-spinner" aria-hidden="true" />
                <p className="pum-scan-title">Reading your receipt…</p>
                <p className="pum-scan-body">We're extracting the reference number automatically. This usually takes a few seconds.</p>
              </>
            )}
            {scan.timedOut && (
              <>
                <p className="pum-scan-title">Receipt received</p>
                <p className="pum-scan-body">It's still being processed — the cashier can already see it and will verify your payment shortly.</p>
              </>
            )}
            {scan.displayStatus === "under_review" && (
              <>
                <p className="pum-scan-title">Receipt read</p>
                {scan.scannedReference ? (
                  <p className="pum-scan-body">
                    We detected reference <span className="pum-scan-ref">{scan.scannedReference}</span>. The cashier will verify it shortly.
                  </p>
                ) : (
                  <p className="pum-scan-body">Your receipt was received and is waiting for cashier verification.</p>
                )}
              </>
            )}
            {scan.displayStatus === "verified" && (
              <>
                <p className="pum-scan-title">Payment verified</p>
                <p className="pum-scan-body">
                  {scan.scannedReference
                    ? <>Reference <span className="pum-scan-ref">{scan.scannedReference}</span> was confirmed by the cashier.</>
                    : "Your payment was confirmed by the cashier."}
                </p>
              </>
            )}
            {scan.displayStatus === "rejected" && (
              <>
                <p className="pum-scan-title">Receipt rejected</p>
                <p className="pum-scan-body">{scan.rejectReason || "The cashier couldn't verify this receipt. Please upload a clearer proof of payment."}</p>
              </>
            )}
            {scan.displayStatus === "manual_entry" && (
              <>
                <p className="pum-scan-title">Couldn't read the reference</p>
                <p className="pum-scan-body">The receipt was received but we couldn't extract a reference number. Type it below — the cashier will verify it with your receipt.</p>
              </>
            )}
          </div>
          {scan.needsManual && (
            <div className="pum-step">
              <p className="pum-step-label">
                <span className="pum-step-number">!</span>
                Enter the reference number from your receipt
              </p>
              <div className="pum-scan-manual-row">
                <input
                  type="text"
                  className="pum-ref-input"
                  placeholder="e.g. 1234567890"
                  value={manualRef}
                  onChange={(e) => setManualRef(e.target.value)}
                />
                <button
                  type="button"
                  className="pum-confirm-btn"
                  disabled={!manualRef.trim() || submittingManualRef}
                  onClick={handleSubmitManualRef}
                >
                  {submittingManualRef ? "Sending…" : "Submit"}
                </button>
              </div>
            </div>
          )}
          {error && <p className="pum-error">{error}</p>}
        </div>
      ) : (
      <div className="pum-body">
          {amount !== null && Number.isFinite(Number(amount)) && (
            <div className="pum-amount">
              <span>Full booking total</span>
              <strong>₱{Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </div>
          )}
          {awaitingBookingApproval && (
            <p className="pum-booking-pending-note">
              Payment proof is optional. This booking remains pending receptionist approval, and the cashier can verify the proof after approval.
            </p>
          )}
          {isRejected && (
            <div className="pum-rejection-note" role="status">
              <strong>Payment proof rejected</strong>
              {rejectionReason && <p>Cashier reason: {rejectionReason}</p>}
              {previousReference && <p>Previous reference: <span>{previousReference}</span></p>}
              <p>Re-upload your proof and re-enter or correct the online payment reference number.</p>
            </div>
          )}
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
              Select receipt photo <span className="pum-required">(JPG, PNG, WEBP, or PDF only, max 5MB)</span>
            </p>
            <p className="pum-ref-note">
              Capture the whole receipt — the reference number, amount, and date must all be visible.
            </p>
            <label className="pum-file-label" htmlFor="pum-file-input">
              {file ? `📎 ${file.name}` : "Choose File"}
            </label>
            <input
              id="pum-file-input"
              type="file"
              accept="image/jpeg,image/png,image/jpg,image/webp,application/pdf"
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
            {blurWarning && (
              <p className="pum-error" role="status">
                This photo looks blurry — a clearer screenshot helps us read your reference correctly.
              </p>
            )}
          </div>

          <div className="pum-step">
            <p className="pum-step-label">
              <span className="pum-step-number">3</span>
              {isRejected ? "Re-enter or correct the payment reference number" : "Reference number (optional)"}
            </p>
            <input
              type="text"
              className="pum-ref-input"
              placeholder={isRejected ? "Re-enter the correct reference number" : "e.g. 1234567890"}
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
            />
            <p className="pum-ref-note">
              We read the reference from your receipt automatically — type it yourself only if it isn't readable in the screenshot. The cashier still verifies the payment before it's confirmed.
            </p>
          </div>

          {error && <p className="pum-error">{error}</p>}
      </div>
      )}
    </Modal>
  );
};

export default PaymentUploadModal;
