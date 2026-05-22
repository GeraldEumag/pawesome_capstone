import React, { useCallback, useEffect, useMemo, useState } from "react";
import { showAlert } from "../../utils/alert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faCalendarAlt,
  faMoneyBillWave,
  faReceipt,
  faCreditCard,
  faSpinner,
  faExclamationTriangle,
  faDownload,
  faEye,
  faSort,
  faCashRegister,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { useTheme } from "../../utils/theme";
import "./CashierHistory.css";

const CashierHistory = () => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState("transactions");
  const [transactions, setTransactions] = useState([]);
  const [paymentVerifications, setPaymentVerifications] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [rejectedPayments, setRejectedPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [selectedRecord, setSelectedRecord] = useState(null);

  // Safe data normalization
  const normalizeList = (result, keys = []) => {
    if (Array.isArray(result)) return result;
    
    for (const key of keys) {
      if (Array.isArray(result?.[key])) return result[key];
    }
    
    if (Array.isArray(result?.data)) return result.data;
    if (Array.isArray(result?.items)) return result.items;
    if (Array.isArray(result?.transactions)) return result.transactions;
    if (Array.isArray(result?.payments)) return result.payments;
    if (Array.isArray(result?.history)) return result.history;
    if (Array.isArray(result?.receipts)) return result.receipts;
    
    return [];
  };

  const formatDate = (value) => {
    if (!value) return "N/A";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric", 
      year: "numeric",
    });
  };

  const formatTime = (value) => {
    if (!value) return "N/A";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleTimeString("en-PH", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadgeClass = (status) => {
    const statusMap = {
      pending: "pending",
      verified: "verified",
      rejected: "rejected",
      completed: "completed",
      paid: "paid",
      unpaid: "unpaid",
    };
    return statusMap[status?.toLowerCase()] || "pending";
  };

  // Fetch POS transaction history
  const fetchTransactions = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const response = await apiRequest("/cashier/transactions");
      const transactionsData = normalizeList(response, ["data", "transactions"]);
      
      setTransactions(transactionsData);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load transaction history");
      setTransactions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch payment verification history
  const fetchPaymentVerifications = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const response = await apiRequest("/cashier/payments");
      const paymentsData = normalizeList(response, ["data", "payments", "history"]);
      
      setPaymentVerifications(paymentsData);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load payment verification history");
      setPaymentVerifications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch receipt history
  const fetchReceipts = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const response = await apiRequest("/cashier/reports/receipts");
      const receiptsData = normalizeList(response, ["data", "receipts", "history"]);
      
      setReceipts(receiptsData);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load receipt history");
      setReceipts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch rejected payments history
  const fetchRejectedPayments = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const response = await apiRequest("/cashier/reports/rejected-payments");
      const rejectedData = normalizeList(response, ["data", "rejected", "history"]);
      
      setRejectedPayments(rejectedData);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load rejected payments history");
      setRejectedPayments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load data based on active tab
  useEffect(() => {
    switch (activeTab) {
      case "transactions":
        fetchTransactions();
        break;
      case "verifications":
        fetchPaymentVerifications();
        break;
      case "receipts":
        fetchReceipts();
        break;
      case "rejected":
        fetchRejectedPayments();
        break;
      default:
        break;
    }
  }, [activeTab, fetchTransactions, fetchPaymentVerifications, fetchReceipts, fetchRejectedPayments]);

  // Filter and sort data
  const filteredData = useMemo(() => {
    let data = [];
    switch (activeTab) {
      case "transactions":
        data = transactions;
        break;
      case "verifications":
        data = paymentVerifications;
        break;
      case "receipts":
        data = receipts;
        break;
      case "rejected":
        data = rejectedPayments;
        break;
      default:
        data = [];
        break;
    }

    if (!data) return [];

    // Apply search filter
    const filtered = data.filter(item => {
      const searchLower = searchTerm.toLowerCase();
      const searchableFields = [
        item.id,
        item.transaction_id,
        item.receipt_number,
        item.customer_name,
        item.customer,
        item.payment_method,
        item.method,
        item.amount,
        item.total_amount,
        item.status,
        item.verified_by,
      ].filter(Boolean).join(' ').toLowerCase();
      
      return searchableFields.includes(searchLower);
    });

    // Apply sorting
    return filtered.sort((a, b) => {
      if (sortBy === "date") {
        const dateA = new Date(a.created_at || a.date || a.transaction_date || 0);
        const dateB = new Date(b.created_at || b.date || b.transaction_date || 0);
        return dateB - dateA;
      }
      if (sortBy === "amount") {
        const amountA = Number(a.amount || a.total_amount || 0);
        const amountB = Number(b.amount || b.total_amount || 0);
        return amountB - amountA;
      }
      return 0;
    });
  }, [activeTab, transactions, paymentVerifications, receipts, rejectedPayments, searchTerm, sortBy]);

  const getMethodIcon = (method) => {
    const methodLower = String(method || "").toLowerCase();
    if (methodLower.includes("card")) return faCreditCard;
    if (methodLower.includes("gcash") || methodLower.includes("maya")) return faMoneyBillWave;
    return faMoneyBillWave;
  };

  const getMethodBadgeClass = (method) => {
    const methodLower = String(method || "").toLowerCase();
    if (methodLower.includes("card")) return "card";
    if (methodLower.includes("gcash")) return "gcash";
    if (methodLower.includes("maya")) return "maya";
    if (methodLower.includes("online")) return "online";
    return "cash";
  };

  const handleRefresh = () => {
    switch (activeTab) {
      case "transactions":
        fetchTransactions({ silent: true });
        break;
      case "verifications":
        fetchPaymentVerifications({ silent: true });
        break;
      case "receipts":
        fetchReceipts({ silent: true });
        break;
      case "rejected":
        fetchRejectedPayments({ silent: true });
        break;
      default:
        break;
    }
  };

  const handleExport = () => {
    const data = filteredData;
    if (!data || data.length === 0) { showAlert("No records to export."); return; }
    const headers = ["ID", "Receipt", "Customer", "Amount", "Method", "Status", "Date", "Verified By"];
    const rows = data.map((r) => [
      r.id, r.receipt_number || "", r.customer_name || r.customer || "",
      r.amount || r.total_amount || 0, r.payment_method || r.method || "",
      r.status || "", formatDate(r.created_at || r.date), r.verified_by || "",
    ]);
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `cashier-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="cashier-history loading">
        <div className="loading-container">
          <FontAwesomeIcon icon={faSpinner} spin className="loading-spinner" />
          <p>Loading cashier history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`cashier-history ${theme}`}>
      <div className="history-header">
        <div className="header-content">
          <h1>Cashier History</h1>
          <p>View your POS transactions, payment verifications, and receipt history</p>
        </div>
        <div className="header-actions">
          <button 
            className="refresh-btn" 
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <FontAwesomeIcon icon={faSpinner} spin={refreshing} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button className="export-btn" onClick={handleExport}>
            <FontAwesomeIcon icon={faDownload} />
            Export
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>{error}</span>
        </div>
      )}

      <div className="history-tabs">
        <button 
          className={`tab-btn ${activeTab === "transactions" ? "active" : ""}`}
          onClick={() => setActiveTab("transactions")}
        >
          <FontAwesomeIcon icon={faCashRegister} />
          POS Transactions
        </button>
        <button 
          className={`tab-btn ${activeTab === "verifications" ? "active" : ""}`}
          onClick={() => setActiveTab("verifications")}
        >
          <FontAwesomeIcon icon={faMoneyBillWave} />
          Payment Verifications
        </button>
        <button 
          className={`tab-btn ${activeTab === "receipts" ? "active" : ""}`}
          onClick={() => setActiveTab("receipts")}
        >
          <FontAwesomeIcon icon={faReceipt} />
          Receipts
        </button>
        <button 
          className={`tab-btn ${activeTab === "rejected" ? "active" : ""}`}
          onClick={() => setActiveTab("rejected")}
        >
          <FontAwesomeIcon icon={faExclamationTriangle} />
          Rejected Payments
        </button>
      </div>

      <div className="history-toolbar">
        <div className="search-box">
          <FontAwesomeIcon icon={faSearch} />
          <input
            type="text"
            placeholder={`Search ${activeTab}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="toolbar-controls">
          <label>
            <FontAwesomeIcon icon={faSort} />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="date">Sort by Date</option>
              <option value="amount">Sort by Amount</option>
            </select>
          </label>
        </div>
        <div className="result-count">
          Showing <strong>{filteredData.length}</strong> records
        </div>
      </div>

      <div className="history-content">
        {filteredData.length === 0 ? (
          <div className="empty-state">
            <FontAwesomeIcon icon={faCashRegister} />
            <h3>No history found</h3>
            <p>
              {searchTerm 
                ? "Try adjusting your search terms." 
                : `Your ${activeTab} history will appear here once you have records.`
              }
            </p>
          </div>
        ) : (
          <div className="history-list">
            {filteredData.map((record) => (
              <div key={record.id} className="history-card">
                <div className="card-header">
                  <div className="record-info">
                    <span className="record-id">
                      #{record.receipt_number || record.id}
                    </span>
                    {record.status && (
                      <span className={`status-badge ${getStatusBadgeClass(record.status)}`}>
                        {record.status}
                      </span>
                    )}
                  </div>
                  <div className="record-date">
                    <FontAwesomeIcon icon={faCalendarAlt} />
                    {formatDate(record.created_at || record.date)} {formatTime(record.created_at || record.date)}
                  </div>
                </div>
                <div className="card-body">
                  <div className="record-details">
                    <div className="detail-row">
                      <span>Customer:</span>
                      <strong>{record.customer_name || record.customer || "Walk-in Customer"}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Amount:</span>
                      <strong>{formatCurrency(record.amount || record.total_amount || 0)}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Payment Method:</span>
                      <div className={`payment-method ${getMethodBadgeClass(record.payment_method || record.method)}`}>
                        <FontAwesomeIcon icon={getMethodIcon(record.payment_method || record.method)} />
                        {record.payment_method || record.method || "Cash"}
                      </div>
                    </div>
                    {record.verified_by && (
                      <div className="detail-row">
                        <span>Verified By:</span>
                        <strong>{record.verified_by}</strong>
                      </div>
                    )}
                    {record.rejection_reason && (
                      <div className="detail-row">
                        <span>Rejection Reason:</span>
                        <span className="rejection-reason">{record.rejection_reason}</span>
                      </div>
                    )}
                    {record.service_name && (
                      <div className="detail-row">
                        <span>Service:</span>
                        <strong>{record.service_name}</strong>
                      </div>
                    )}
                    {record.pet_name && (
                      <div className="detail-row">
                        <span>Pet:</span>
                        <strong>{record.pet_name}</strong>
                      </div>
                    )}
                  </div>
                </div>
                <div className="card-footer">
                  <button 
                    className="view-btn"
                    onClick={() => setSelectedRecord(record)}
                  >
                    <FontAwesomeIcon icon={faEye} />
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedRecord && (
        <div className="modal-overlay" onClick={() => setSelectedRecord(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Transaction Details</h3>
              <button onClick={() => setSelectedRecord(null)}>×</button>
            </div>
            <div className="modal-body">
              <pre>{JSON.stringify(selectedRecord, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashierHistory;
