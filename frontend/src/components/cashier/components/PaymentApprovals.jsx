import { useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faRefresh, 
  faSpinner, 
  faSearch, 
  faFilter, 
  faSort, 
  faDownload,
  faCheck,
  faTimes,
  faPaperclip,
  faTimesCircle,
  faPrint
} from "@fortawesome/free-solid-svg-icons";
import { showSuccess, showError, showWarning, showAlert } from "../../../utils/alert.jsx";
import { printReceipt } from "../../../utils/receiptPrinter";
import { usePaymentApprovals } from "../hooks/usePaymentApprovals.jsx";
import { useAuth } from "../../../context/AuthContext";
import "./PaymentApprovals.css";

const PaymentApprovals = () => {
  const { user } = useAuth();
  const {
    filteredRequests,
    loading,
    refreshing,
    actionLoading,
    lastUpdated,
    stats,
    searchTerm,
    setSearchTerm,
    typeFilter,
    setTypeFilter,
    sortBy,
    setSortBy,
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    fetchRequests,
    verifyPayment,
    rejectPayment,
    bulkVerify,
    bulkReject,
    exportToCSV,
    proofModal,
    openProof,
    closeProof,
  } = usePaymentApprovals(user);

  // State for reference number input in proof modal
  const [referenceNumber, setReferenceNumber] = useState("");
  const [isRefVerified, setIsRefVerified] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  
  // Use ref to always have latest value
  const referenceNumberRef = useRef(referenceNumber);
  referenceNumberRef.current = referenceNumber;
  
  // Reset ref verified state when modal opens/closes
  useEffect(() => {
    if (!proofModal) {
      setIsRefVerified(false);
      setReferenceNumber("");
    }
  }, [proofModal]);

  // Handle verify with reference number from modal
  const handleVerifyFromModal = async () => {
    const refNum = referenceNumberRef.current;
    
    if (!proofModal?.payment) {
      showError("Payment data not available");
      return;
    }
    
    const result = await verifyPayment(proofModal.payment, refNum?.trim() || "");
    if (result?.success) {
      // Show receipt after successful verification
      const payment = proofModal.payment;
      setReceiptData({
        id: payment.id,
        customer_name: payment.customer_name,
        service_name: payment.service_name || payment.request_type || "Service",
        amount: payment.amount || 0,
        receipt_number: result.receipt_number,
        reference_number: refNum?.trim() || "Counter Payment",
        paid_at: new Date().toISOString(),
        verified_by: user?.name || "Cashier",
      });
      closeProof();
      setShowReceipt(true);
      setReferenceNumber("");
    }
  };

  // Handle reject from modal
  const handleRejectFromModal = async () => {
    if (!proofModal?.payment) {
      showError("Payment data not available");
      return;
    }
    await rejectPayment(proofModal.payment);
    closeProof();
    setReferenceNumber("");
  };

  const getTypeIcon = (type) => {
    switch (type?.toLowerCase()) {
      case "boarding": return "🏨";
      case "appointment": return "🩺";
      case "grooming": return "✂️";
      case "service": return "🛍️";
      default: return "📦";
    }
  };

  return (
    <div className="payment-approvals">
      {/* Header */}
      <div className="pa-header">
        <div className="pa-header-title">
          <span className="pa-badge">CASHIER</span>
          <h2>Payment Approvals</h2>
          <p>Verify customer payment proofs and process transactions</p>
        </div>
        <div className="pa-header-actions">
          <button
            className="pa-btn-secondary"
            onClick={() => fetchRequests()}
            disabled={refreshing}
          >
            <FontAwesomeIcon icon={refreshing ? faSpinner : faRefresh} spin={refreshing} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button
            className="pa-btn-primary"
            onClick={exportToCSV}
            disabled={filteredRequests.length === 0}
          >
            <FontAwesomeIcon icon={faDownload} /> Export CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="pa-stats">
        <div className="pa-stat-card">
          <div className="pa-stat-icon">📋</div>
          <div className="pa-stat-content">
            <span className="pa-stat-value">{stats.total}</span>
            <span className="pa-stat-label">Pending</span>
          </div>
        </div>
        <div className="pa-stat-card pa-stat-highlight">
          <div className="pa-stat-icon">💰</div>
          <div className="pa-stat-content">
            <span className="pa-stat-value">₱{stats.totalAmount.toLocaleString("en-PH")}</span>
            <span className="pa-stat-label">Total Amount</span>
          </div>
        </div>
        <div className="pa-stat-card">
          <div className="pa-stat-icon">✅</div>
          <div className="pa-stat-content">
            <span className="pa-stat-value">{stats.verifiedToday}</span>
            <span className="pa-stat-label">Verified Today</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="pa-filters">
        <div className="pa-search">
          <FontAwesomeIcon icon={faSearch} />
          <input
            type="text"
            placeholder="Search customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="pa-filter-group">
          <FontAwesomeIcon icon={faFilter} />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            <option value="boarding">Boarding</option>
            <option value="appointment">Appointment</option>
            <option value="grooming">Grooming</option>
            <option value="service">Service</option>
          </select>
        </div>

        <div className="pa-filter-group">
          <FontAwesomeIcon icon={faSort} />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="amount-desc">Highest Amount</option>
            <option value="amount-asc">Lowest Amount</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
          </select>
        </div>

        <div className="pa-filter-meta">
          <span className="pa-result-count">{filteredRequests.length} results</span>
          {lastUpdated && (
            <span className="pa-last-updated">
              Updated {lastUpdated.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="pa-bulk-bar">
          <div className="pa-bulk-info">
            <label className="pa-bulk-checkbox">
              <input
                type="checkbox"
                checked={filteredRequests.every(r => selectedIds.includes(r.id))}
                onChange={selectAll}
              />
              <span>{selectedIds.length} selected</span>
            </label>
            <button className="pa-btn-clear" onClick={clearSelection}>
              <FontAwesomeIcon icon={faTimesCircle} /> Clear
            </button>
          </div>
          <div className="pa-bulk-actions">
            <button className="pa-btn-bulk-verify" onClick={bulkVerify}>
              <FontAwesomeIcon icon={faCheck} /> Verify All
            </button>
            <button className="pa-btn-bulk-reject" onClick={bulkReject}>
              <FontAwesomeIcon icon={faTimes} /> Reject All
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="pa-loading">
          <FontAwesomeIcon icon={faSpinner} spin size="2x" />
          <p>Loading payment requests...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredRequests.length === 0 && (
        <div className="pa-empty">
          <div className="pa-empty-icon">📭</div>
          <h3>No pending payments</h3>
          <p>
            {searchTerm || typeFilter !== "all"
              ? "Try adjusting your filters to see more results."
              : "New payment requests will appear here automatically."}
          </p>
          {(searchTerm || typeFilter !== "all") && (
            <button
              className="pa-btn-primary"
              onClick={() => {
                setSearchTerm("");
                setTypeFilter("all");
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Payment Cards */}
      {!loading && filteredRequests.length > 0 && (
        <div className="pa-cards">
          {filteredRequests.map((payment) => {
            const customerName = payment.customer_name || payment.customer?.name || "Unknown";
            const customerEmail = payment.customer?.email || "No email";
            const type = payment.request_type || payment.type || "-";
            const service = payment.service_name || payment.service?.name || payment.order_name || "-";
            const amount = Number(payment.amount || payment.total_amount || 0).toLocaleString("en-PH");
            const hasProof = !!payment.proof_url;
            const isVerifyLoading = actionLoading === `${payment.id}-verify`;
            const isRejectLoading = actionLoading === `${payment.id}-reject`;

            return (
              <div
                key={payment.id}
                className={`pa-card ${selectedIds.includes(payment.id) ? "pa-card-selected" : ""}`}
              >
                <div className="pa-card-header">
                  <label className="pa-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(payment.id)}
                      onChange={() => toggleSelection(payment.id)}
                    />
                    <span className="pa-checkmark"></span>
                  </label>
                  <div className="pa-customer">
                    <span className="pa-customer-name">👤 {customerName}</span>
                    <span className="pa-customer-email">{customerEmail}</span>
                  </div>
                  <span className="pa-time">
                    {new Date(payment.request_date || payment.date || payment.created_at).toLocaleTimeString("en-PH", {
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </span>
                </div>

                <div className="pa-card-body">
                  <div className="pa-service">
                    <span className="pa-service-icon">{getTypeIcon(type)}</span>
                    <div className="pa-service-info">
                      <span className="pa-service-type">{type}</span>
                      <span className="pa-service-name">{service}</span>
                    </div>
                  </div>
                  <div className="pa-amount-section">
                    <span className="pa-amount">₱{amount}</span>
                    {hasProof && (
                      <button
                        className="pa-proof-btn"
                        onClick={() => openProof(payment.proof_url, payment)}
                      >
                        <FontAwesomeIcon icon={faPaperclip} /> View Proof
                      </button>
                    )}
                  </div>
                </div>

                <div className="pa-card-actions">
                  <button
                    className="pa-btn-verify"
                    onClick={() => {
                      if (payment.proof_url) {
                        openProof(payment.proof_url, payment);
                      } else {
                        openProof(null, payment);
                      }
                    }}
                    disabled={isVerifyLoading || isRejectLoading}
                  >
                    <FontAwesomeIcon icon={faCheck} /> Verify
                  </button>
                  <button
                    className="pa-btn-reject"
                    onClick={() => rejectPayment(payment)}
                    disabled={isVerifyLoading || isRejectLoading}
                  >
                    {isRejectLoading ? (
                      <><FontAwesomeIcon icon={faSpinner} spin /> Rejecting...</>
                    ) : (
                      <><FontAwesomeIcon icon={faTimes} /> Reject</>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Proof Modal with Reference Number Input */}
      {proofModal && (
        <div className="pa-modal-overlay" onClick={closeProof}>
          <div className="pa-modal pa-proof-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pa-modal-header">
              <h3>Payment Proof</h3>
              <button className="pa-modal-close" onClick={closeProof}>
                <FontAwesomeIcon icon={faTimesCircle} />
              </button>
            </div>
            <div className="pa-modal-body">
              <div className="pa-proof-image-container">
                {proofModal.blobUrl ? (
                  <img 
                    src={proofModal.blobUrl} 
                    alt="Payment Proof" 
                    className="pa-proof-image"
                  />
                ) : proofModal.payment && !proofModal.payment.proof_url ? (
                  <div className="pa-proof-loading" style={{ background: "#f0fdf4", color: "#166534" }}>
                    <FontAwesomeIcon icon={faCheck} size="2x" />
                    <p>Counter payment — no proof uploaded.</p>
                  </div>
                ) : (
                  <div className="pa-proof-loading">
                    <FontAwesomeIcon icon={faSpinner} spin size="2x" />
                    <p>Loading proof...</p>
                  </div>
                )}
              </div>
              <div className="pa-reference-section">
                <label htmlFor="referenceNumber" className="pa-reference-label">
                  <strong>GCash / Counter Reference Number</strong>
                  <span className="pa-reference-hint">Optional for counter payments</span>
                </label>
                <div className="pa-reference-input-group">
                  <input
                    type="text"
                    id="referenceNumber"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Enter GCash reference number from receipt"
                    className="pa-reference-input"
                  />
                  <button
                    className={`pa-btn-verify-ref ${isRefVerified ? 'verified' : ''}`}
                    onClick={() => {
                      if (!referenceNumber.trim()) {
                        showWarning("Please enter a reference number");
                        return;
                      }
                      if (referenceNumber.trim().length < 6) {
                        showWarning("Reference number must be at least 6 characters");
                        return;
                      }
                      setIsRefVerified(true);
                      showSuccess("Reference number verified!");
                    }}
                    disabled={!referenceNumber.trim() || isRefVerified}
                  >
                    <FontAwesomeIcon icon={isRefVerified ? faCheck : faCheck} /> 
                    {isRefVerified ? "Verified" : "Verify Ref #"}
                  </button>
                </div>
              </div>
            </div>
            <div className="pa-modal-footer">
              <button 
                className="pa-btn-reject" 
                onClick={handleRejectFromModal}
                disabled={actionLoading}
              >
                {actionLoading === `${proofModal?.payment?.id}-reject` ? (
                  <><FontAwesomeIcon icon={faSpinner} spin /> Rejecting...</>
                ) : (
                  <><FontAwesomeIcon icon={faTimes} /> Reject</>
                )}
              </button>
              <button 
                className="pa-btn-verify" 
                onClick={handleVerifyFromModal}
                disabled={actionLoading}
              >
                {actionLoading === `${proofModal?.payment?.id}-verify` ? (
                  <><FontAwesomeIcon icon={faSpinner} spin /> Verifying...</>
                ) : (
                  <><FontAwesomeIcon icon={faCheck} /> Verify Payment</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && receiptData && (
        <div className="pa-modal-overlay" onClick={() => setShowReceipt(false)}>
          <div className="pa-modal pa-receipt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pa-receipt">
              <div className="pa-receipt-header">
                <h2>OFFICIAL RECEIPT</h2>
                <p className="pa-receipt-number">{receiptData.receipt_number}</p>
              </div>
              <div className="pa-receipt-body">
                <div className="pa-receipt-row">
                  <span>Date:</span>
                  <span>{new Date(receiptData.paid_at).toLocaleString('en-PH')}</span>
                </div>
                <div className="pa-receipt-row">
                  <span>Customer:</span>
                  <span>{receiptData?.customer_name || "N/A"}</span>
                </div>
                <div className="pa-receipt-row">
                  <span>Service:</span>
                  <span>{receiptData?.service_name || "Service"}</span>
                </div>
                <div className="pa-receipt-row">
                  <span>Amount:</span>
                  <span>₱{Number(receiptData?.amount || 0).toLocaleString('en-PH')}</span>
                </div>
                <div className="pa-receipt-row">
                  <span>Reference #:</span>
                  <span>{receiptData?.reference_number || "N/A"}</span>
                </div>
                <div className="pa-receipt-row">
                  <span>Verified by:</span>
                  <span>{receiptData?.verified_by || "Cashier"}</span>
                </div>
              </div>
              <div className="pa-receipt-footer">
                <p>Thank you for choosing Pawesome Vet Clinic!</p>
              </div>
            </div>
            <div className="pa-modal-footer">
              <button 
                className="pa-btn-secondary" 
                onClick={() => setShowReceipt(false)}
              >
                Close
              </button>
              <button
                className="pa-btn-primary"
                onClick={() => {
                  const r = receiptData;
                  printReceipt({
                    title: "Official Payment Receipt",
                    receiptNumber: r.receipt_number || "N/A",
                    date: r.paid_at ? new Date(r.paid_at).toLocaleString("en-PH") : new Date().toLocaleString("en-PH"),
                    cashier: user?.name || "Cashier",
                    customer: r.customer_name || "Customer",
                    paymentMethod: r.payment_method || "Online Payment",
                    paymentStatus: "paid",
                    referenceNumber: r.reference_number || "",
                    verifiedBy: r.verified_by || user?.name || "Cashier",
                    items: [{ name: r.service_name || "Service", quantity: 1, unitPrice: Number(r.amount || 0), total: Number(r.amount || 0) }],
                    subtotal: Number(r.amount || 0),
                    total: Number(r.amount || 0),
                  });
                }}
              >
                <FontAwesomeIcon icon={faPrint} /> Print
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentApprovals;
