import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { apiRequest } from "../../api/client";
import { getToken } from "../../utils/auth";
import { useAuth } from "../../context/AuthContext";
import { normalizeList } from "../../utils/normalizeList";
import "./CashierPaymentVerification.css";
import { showAlert, showSuccess, showError, showPrompt, showConfirm } from "../../utils/alert.jsx";
import { printReceipt as printReceiptUtil } from "../../utils/receiptPrinter";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateRight, faInbox, faXmark } from "@fortawesome/free-solid-svg-icons";

const formatDate = (dateStr) => {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
};


const CashierPaymentVerification = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [actionLoading, setActionLoading] = useState({}); // { [id]: 'verify' | 'reject' }
  const [proofModal, setProofModal] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const rateLimitedRef = useRef(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const openProof = useCallback(async (proofUrl) => {
    setProofModal({ blobUrl: null, isPdf: false, loading: true, error: null });
    try {
      const token = getToken();
      const res = await fetch(proofUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const isPdf = blob.type === "application/pdf";
      setProofModal({ blobUrl, isPdf, loading: false, error: null });
    } catch (err) {
      setProofModal({ blobUrl: null, isPdf: false, loading: false, error: err.message });
    }
  }, []);

  const closeProof = useCallback(() => {
    if (proofModal?.blobUrl) URL.revokeObjectURL(proofModal.blobUrl);
    setProofModal(null);
  }, [proofModal]);

  const fetchRequests = async (silent = false) => {
    if (rateLimitedRef.current) return;
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const data = await apiRequest("/cashier/payment-requests");
      const list = normalizeList(data, ["payments", "requests", "data"]);
      setRequests(list);
      setLastUpdated(new Date());
    } catch (err) {
      if (err?.message?.toLowerCase().includes("too many") || err?.status === 429) {
        console.warn("Payment requests rate limited — pausing for 5 minutes.");
        rateLimitedRef.current = true;
        setTimeout(() => { rateLimitedRef.current = false; }, 5 * 60 * 1000);
      } else {
        console.error("Failed to load payment requests:", err);
      }
      if (!silent) setRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const verifyPayment = async (payment) => {
    const confirmed = await showConfirm(
      `Verify payment of ₱${Number(payment.amount || payment.total_amount || 0).toLocaleString("en-PH")} from ${payment.customer_name || payment.customer?.name || "Customer"}?`,
      "Confirm Verification"
    );
    if (!confirmed) return;

    setActionLoading((prev) => ({ ...prev, [payment.id]: "verify" }));
    try {
      const data = await apiRequest(`/cashier/payment-requests/${payment.id}/verify`, "POST", {
        type: payment.payable_type || payment.type || payment.payment_source || "service_request",
        cashier_remarks: "Payment verified by cashier",
      });

      if (data && data.success) {
        printReceipt(data, payment);
        showSuccess(data.message || `Payment verified. Receipt: ${data.receipt_number || "Generated"}`);
        fetchRequests(true);
      } else {
        showAlert(data?.message || "Failed to verify payment.");
      }
    } catch (err) {
      console.error("Failed to verify payment:", err);
      showError(err.message || "Failed to verify payment.");
    } finally {
      setActionLoading((prev) => { const n = { ...prev }; delete n[payment.id]; return n; });
    }
  };

  const printReceipt = (data, payment) => {
    const receiptNumber = data.receipt_number || data.receipt?.receipt_number || `REC-${payment.id}`;
    const amount = Number(data.amount || data.receipt?.total_amount || payment.amount || payment.total_amount || 0);
    const date = new Date().toLocaleString("en-PH");
    const cashier = user?.name || "Cashier";
    const customer = payment.customer_name || payment.customer?.name || "Customer";
    const service = payment.service_name || payment.service?.name || payment.order_name || payment.request_type || payment.type || "Payment";
    const method = payment.payment_method || data.payment_method || "Online Payment";
    const referenceNumber = data.reference_number || payment.payment_reference || "";

    // Build items list — use actual items if available, otherwise single service line
    let items;
    const rawItems = data.receipt?.items || payment.items || [];
    if (rawItems.length > 0) {
      items = rawItems.map((item) => ({
        name: item.item_name || item.name || item.description || "Item",
        quantity: Number(item.quantity || 1),
        unitPrice: Number(item.unit_price || item.price || item.amount || 0),
        total: Number(item.total_price || item.total || item.amount || 0),
      }));
    } else {
      items = [{ name: service, quantity: 1, unitPrice: amount, total: amount }];
    }

    printReceiptUtil({
      title: "Official Payment Receipt",
      receiptNumber,
      date,
      cashier,
      customer,
      paymentMethod: method,
      paymentStatus: "paid",
      referenceNumber,
      verifiedBy: cashier,
      items,
      subtotal: amount,
      total: amount,
    });
  };

  const rejectPayment = async (payment) => {
    const cashier_remarks = await showPrompt("Reason for rejecting this payment proof:");
    if (cashier_remarks === null) return;

    setActionLoading((prev) => ({ ...prev, [payment.id]: "reject" }));
    try {
      const data = await apiRequest(`/cashier/payment-requests/${payment.id}/reject`, "POST", {
        type: payment.payable_type || payment.type || payment.payment_source || "service_request",
        cashier_remarks,
        rejection_reason: cashier_remarks,
      });

      if (data && data.success) {
        showSuccess(data.message || "Payment rejected.");
        fetchRequests(true);
      } else {
        showAlert(data?.message || "Failed to reject payment.");
      }
    } catch (err) {
      console.error("Failed to reject payment:", err);
      showError(err.message || "Failed to reject payment.");
    } finally {
      setActionLoading((prev) => { const n = { ...prev }; delete n[payment.id]; return n; });
    }
  };

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(() => fetchRequests(true), 60000);
    return () => clearInterval(interval);
  }, []);

  const filteredRequests = useMemo(() => {
    let list = [...requests];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.customer_name || r.customer?.name || "").toLowerCase().includes(q) ||
          (r.service_name || r.service?.name || r.order_name || "").toLowerCase().includes(q)
      );
    }
    if (typeFilter) {
      list = list.filter((r) => (r.request_type || r.type || "").toLowerCase() === typeFilter.toLowerCase());
    }
    if (statusFilter) {
      const sf = statusFilter.toLowerCase();
      list = list.filter((r) => {
        const ps = (r.payment_status || "pending").toLowerCase();
        if (sf === "pending") return ps === "pending" || ps === "unpaid";
        return ps === sf;
      });
    }
    return list;
  }, [requests, searchQuery, typeFilter, statusFilter]);

  const uniqueTypes = useMemo(() => {
    const types = new Set();
    requests.forEach((r) => { const t = r.request_type || r.type; if (t) types.add(t); });
    return Array.from(types);
  }, [requests]);

  const stats = useMemo(() => {
    const pending = requests.filter((r) => {
      const ps = (r.payment_status || "pending").toLowerCase();
      return ps === "pending" || ps === "unpaid";
    });
    const totalAmount = pending.reduce((sum, r) => sum + Number(r.amount || r.total_amount || 0), 0);
    return {
      totalPending: pending.length,
      totalAmount,
      verifiedToday: requests.filter((r) => {
        const ps = (r.payment_status || "").toLowerCase();
        return ps === "verified" || ps === "paid";
      }).filter((r) => {
        const d = new Date(r.updated_at || r.created_at || r.paid_at);
        const today = new Date();
        return d.toDateString() === today.toDateString();
      }).length,
    };
  }, [requests]);

  return (
    <div className="cashier-payment-verification">
            <div className="payment-hero premium-card fade-up">
              <h1>Approved Requests</h1>
              <p>Process payments for customer-approved bookings and orders</p>
              <div className="badge badge-info">Payment Control Panel</div>
            </div>

            {/* Stats Summary */}
            <div className="stats-summary fade-up">
              <div className="stat-card">
                <div className="stat-value">{stats.totalPending}</div>
                <div className="stat-label">Pending</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">₱{stats.totalAmount.toLocaleString("en-PH")}</div>
                <div className="stat-label">Total Amount</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.verifiedToday}</div>
                <div className="stat-label">Verified Today</div>
              </div>
            </div>

            {loading ? (
              <div className="loading-container">
                <p>Loading payment requests...</p>
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="payment-card fade-up">
                <div className="empty-state">
                  <div className="empty-state-icon"><FontAwesomeIcon icon={faInbox} /></div>
                  <h3>No pending payments</h3>
                  <p>{requests.length === 0 ? "No approved requests pending payment." : "No results match your filters."}</p>
                  <button type="button" className="refresh-btn" onClick={() => fetchRequests(true)} disabled={refreshing}>
                    <FontAwesomeIcon icon={faRotateRight} spin={refreshing} />
                    {refreshing ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="payment-card fade-up">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "16px" }}>
                  <h2 style={{ margin: 0 }}>Pending Payments</h2>
                  <button type="button" className="refresh-btn" onClick={() => fetchRequests(true)} disabled={refreshing}>
                    <FontAwesomeIcon icon={faRotateRight} spin={refreshing} />
                    {refreshing ? "Refreshing…" : "Refresh"}
                  </button>
                </div>

                {lastUpdated && (
                  <div className="last-updated">
                    Last updated: {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}
                  </div>
                )}

                {/* Filters */}
                <div className="payment-filters">
                  <input type="text" placeholder="Search customer or service..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                    <option value="">All Types</option>
                    {uniqueTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="">All Statuses</option>
                    <option value="pending">Pending / Unpaid</option>
                    <option value="paid">Paid</option>
                    <option value="verified">Verified</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                {/* Desktop Table */}
                <div className="payment-table-wrapper">
                  <table className="payment-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Type</th>
                        <th>Service / Order</th>
                        <th>Date</th>
                        <th style={{ textAlign: "right" }}>Amount</th>
                        <th>Proof</th>
                        <th>Payment</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequests.map((item) => {
                        const action = actionLoading[item.id];
                        return (
                          <tr key={item.id}>
                            <td>{item.customer_name || item.customer?.name || "Customer"}</td>
                            <td>{item.request_type || item.type || "Request"}</td>
                            <td>{item.service_name || item.service?.name || item.order_name || "N/A"}</td>
                            <td>{formatDate(item.request_date || item.date || item.created_at)}</td>
                            <td className="amount-cell">₱{Number(item.amount || item.total_amount || 0).toLocaleString("en-PH")}</td>
                            <td>
                              {item.proof_url ? (
                                <button type="button" className="proof-link" onClick={() => openProof(item.proof_url)}>View Proof</button>
                              ) : (
                                <span className="no-proof">No proof</span>
                              )}
                            </td>
                            <td>
                              <span className={`status-badge ${String(item.payment_status || "pending").toLowerCase()}`}>
                                {item.payment_status || "pending"}
                              </span>
                            </td>
                            <td className="payment-actions">
                              <button className="verify-btn" type="button" disabled={!!action} onClick={() => verifyPayment(item)}>
                                {action === "verify" ? <span className="btn-spinner" /> : null}
                                {action === "verify" ? "Verifying…" : "Verify Payment"}
                              </button>
                              <button className="reject-btn" type="button" disabled={!!action} onClick={() => rejectPayment(item)}>
                                {action === "reject" ? <span className="btn-spinner" /> : null}
                                {action === "reject" ? "Rejecting…" : "Reject"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="payment-cards-mobile">
                  {filteredRequests.map((item) => {
                    const action = actionLoading[item.id];
                    return (
                      <div className="payment-card-item" key={item.id}>
                        <div className="card-row"><span className="card-label">Customer</span><span className="card-value">{item.customer_name || item.customer?.name || "Customer"}</span></div>
                        <div className="card-row"><span className="card-label">Type</span><span className="card-value">{item.request_type || item.type || "Request"}</span></div>
                        <div className="card-row"><span className="card-label">Service</span><span className="card-value">{item.service_name || item.service?.name || item.order_name || "N/A"}</span></div>
                        <div className="card-row"><span className="card-label">Date</span><span className="card-value">{formatDate(item.request_date || item.date || item.created_at)}</span></div>
                        <div className="card-row"><span className="card-label">Amount</span><span className="card-value">₱{Number(item.amount || item.total_amount || 0).toLocaleString("en-PH")}</span></div>
                        <div className="card-row">
                          <span className="card-label">Proof</span>
                          <span className="card-value">
                            {item.proof_url ? (
                              <button type="button" className="proof-link" onClick={() => openProof(item.proof_url)}>View Proof</button>
                            ) : (
                              <span className="no-proof">No proof</span>
                            )}
                          </span>
                        </div>
                        <div className="card-row">
                          <span className="card-label">Status</span>
                          <span className="card-value">
                            <span className={`status-badge ${String(item.payment_status || "pending").toLowerCase()}`}>
                              {item.payment_status || "pending"}
                            </span>
                          </span>
                        </div>
                        <div className="card-actions">
                          <button className="verify-btn" type="button" disabled={!!action} onClick={() => verifyPayment(item)}>
                            {action === "verify" ? <span className="btn-spinner" /> : null}
                            {action === "verify" ? "Verifying…" : "Verify"}
                          </button>
                          <button className="reject-btn" type="button" disabled={!!action} onClick={() => rejectPayment(item)}>
                            {action === "reject" ? <span className="btn-spinner" /> : null}
                            {action === "reject" ? "Rejecting…" : "Reject"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
      {proofModal && (
        <div className="proof-modal-overlay" onClick={closeProof}>
          <div className="proof-modal" onClick={(e) => e.stopPropagation()}>
            <div className="proof-modal-header">
              <span>Payment Proof</span>
              <button type="button" className="proof-modal-close" onClick={closeProof}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
            <div className="proof-modal-body">
              {proofModal.loading && (
                <div className="proof-modal-state">Loading proof…</div>
              )}
              {proofModal.error && (
                <div className="proof-modal-state error">
                  Failed to load: {proofModal.error}
                </div>
              )}
              {proofModal.blobUrl && !proofModal.isPdf && (
                <img
                  src={proofModal.blobUrl}
                  alt="Payment proof"
                  className="proof-modal-img"
                />
              )}
              {proofModal.blobUrl && proofModal.isPdf && (
                <iframe
                  src={proofModal.blobUrl}
                  title="Payment proof PDF"
                  className="proof-modal-pdf"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashierPaymentVerification;
