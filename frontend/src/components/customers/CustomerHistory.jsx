import React, { useCallback, useEffect, useMemo, useState } from "react";
import { showAlert } from "../../utils/alert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faCalendarAlt,
  faBox,
  faCreditCard,
  faSpinner,
  faExclamationTriangle,
  faDownload,
  faEye,
  faSort,
  faPaw,
  faHotel,
  faCut,
  faStethoscope,
  faClock,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { useTheme } from "../../utils/theme";
import "./CustomerHistory.css";

const CustomerHistory = () => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState("orders");
  const [orders, setOrders] = useState([]);
  const [requests, setRequests] = useState([]);
  const [payments, setPayments] = useState([]);
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
    if (Array.isArray(result?.orders)) return result.orders;
    if (Array.isArray(result?.requests)) return result.requests;
    if (Array.isArray(result?.payments)) return result.payments;
    if (Array.isArray(result?.history)) return result.history;
    
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
      approved: "approved",
      rejected: "rejected",
      completed: "completed",
      cancelled: "cancelled",
      paid: "paid",
      unpaid: "unpaid",
      verified: "verified",
      scheduled: "scheduled",
      in_progress: "in-progress",
    };
    return statusMap[status?.toLowerCase()] || "pending";
  };

  // Fetch customer orders history
  const fetchOrders = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const response = await apiRequest("/customer/orders/history");
      const ordersData = normalizeList(response, ["data", "orders"]);
      
      setOrders(ordersData);
      setError("");
    } catch (err) {
      console.error("Failed to fetch orders:", err);
      setError(err.message || "Failed to load orders history");
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch customer service requests history
  const fetchRequests = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const response = await apiRequest("/customer/requests/history");
      const requestsData = normalizeList(response, ["data", "requests"]);
      
      setRequests(requestsData);
      setError("");
    } catch (err) {
      console.error("Failed to fetch requests:", err);
      setError(err.message || "Failed to load requests history");
      setRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch customer payments history
  const fetchPayments = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const response = await apiRequest("/customer/payments/history");
      const paymentsData = normalizeList(response, ["data", "payments"]);
      
      setPayments(paymentsData);
      setError("");
    } catch (err) {
      console.error("Failed to fetch payments:", err);
      setError(err.message || "Failed to load payments history");
      setPayments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load data based on active tab
  useEffect(() => {
    switch (activeTab) {
      case "orders":
        fetchOrders();
        break;
      case "requests":
        fetchRequests();
        break;
      case "payments":
        fetchPayments();
        break;
      default:
        break;
    }
  }, [activeTab, fetchOrders, fetchRequests, fetchPayments]);

  // Filter and sort data
  const filteredData = useMemo(() => {
    let data = [];
    switch (activeTab) {
      case "orders":
        data = orders;
        break;
      case "requests":
        data = requests;
        break;
      case "payments":
        data = payments;
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
        item.order_id,
        item.request_id,
        item.payment_id,
        item.status,
        item.payment_status,
        item.service_type,
        item.pet_name,
        item.total_amount,
        item.amount,
      ].filter(Boolean).join(' ').toLowerCase();
      
      return searchableFields.includes(searchLower);
    });

    // Apply sorting
    return filtered.sort((a, b) => {
      if (sortBy === "date") {
        const dateA = new Date(a.created_at || a.date || 0);
        const dateB = new Date(b.created_at || b.date || 0);
        return dateB - dateA;
      }
      if (sortBy === "amount") {
        const amountA = Number(a.total_amount || a.amount || 0);
        const amountB = Number(b.total_amount || b.amount || 0);
        return amountB - amountA;
      }
      return 0;
    });
  }, [activeTab, orders, requests, payments, searchTerm, sortBy]);

  const getServiceIcon = (serviceType) => {
    const type = String(serviceType || "").toLowerCase();
    if (type.includes("hotel") || type.includes("boarding")) return faHotel;
    if (type.includes("groom")) return faCut;
    if (type.includes("vet") || type.includes("medical")) return faStethoscope;
    return faPaw;
  };

  const handleRefresh = () => {
    switch (activeTab) {
      case "orders":
        fetchOrders({ silent: true });
        break;
      case "requests":
        fetchRequests({ silent: true });
        break;
      case "payments":
        fetchPayments({ silent: true });
        break;
      default:
        break;
    }
  };

  const handleExport = () => {
    // TODO: Implement export functionality
    showAlert("Export feature coming soon!");
  };

  if (loading) {
    return (
      <div className="customer-history loading">
        <div className="loading-container">
          <FontAwesomeIcon icon={faSpinner} spin className="loading-spinner" />
          <p>Loading your history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`customer-history ${theme}`}>
      <div className="history-header">
        <div className="header-content">
          <h1>My History</h1>
          <p>View your orders, service requests, and payment records</p>
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
          className={`tab-btn ${activeTab === "orders" ? "active" : ""}`}
          onClick={() => setActiveTab("orders")}
        >
          <FontAwesomeIcon icon={faBox} />
          My Orders
        </button>
        <button 
          className={`tab-btn ${activeTab === "requests" ? "active" : ""}`}
          onClick={() => setActiveTab("requests")}
        >
          <FontAwesomeIcon icon={faCalendarAlt} />
          Service Requests
        </button>
        <button 
          className={`tab-btn ${activeTab === "payments" ? "active" : ""}`}
          onClick={() => setActiveTab("payments")}
        >
          <FontAwesomeIcon icon={faCreditCard} />
          Payments
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
            <FontAwesomeIcon icon={faCalendarAlt} />
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
            {activeTab === "orders" && filteredData.map((order) => (
              <div key={order.id} className="history-card order-card">
                <div className="card-header">
                  <div className="order-info">
                    <span className="order-id">#{order.id}</span>
                    <span className={`status-badge ${getStatusBadgeClass(order.status)}`}>
                      {order.status}
                    </span>
                  </div>
                  <div className="order-date">
                    <FontAwesomeIcon icon={faClock} />
                    {formatDate(order.created_at)} {formatTime(order.created_at)}
                  </div>
                </div>
                <div className="card-body">
                  <div className="order-details">
                    <div className="detail-row">
                      <span>Total Amount:</span>
                      <strong>{formatCurrency(order.total_amount || 0)}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Payment Status:</span>
                      <span className={`payment-status ${getStatusBadgeClass(order.payment_status)}`}>
                        {order.payment_status || "pending"}
                      </span>
                    </div>
                    {order.items && (
                      <div className="order-items">
                        <span>Items:</span>
                        <div className="items-list">
                          {Array.isArray(order.items) ? order.items.slice(0, 3).map((item, idx) => (
                            <span key={idx} className="item-tag">{item.name || item.product_name}</span>
                          )) : "No items"}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="card-footer">
                  <button 
                    className="view-btn"
                    onClick={() => setSelectedRecord(order)}
                  >
                    <FontAwesomeIcon icon={faEye} />
                    View Details
                  </button>
                </div>
              </div>
            ))}

            {activeTab === "requests" && filteredData.map((request) => (
              <div key={request.id} className="history-card request-card">
                <div className="card-header">
                  <div className="request-info">
                    <span className="request-id">#{request.id}</span>
                    <span className={`status-badge ${getStatusBadgeClass(request.status)}`}>
                      {request.status}
                    </span>
                  </div>
                  <div className="request-date">
                    <FontAwesomeIcon icon={faClock} />
                    {formatDate(request.created_at)} {formatTime(request.created_at)}
                  </div>
                </div>
                <div className="card-body">
                  <div className="request-details">
                    <div className="detail-row">
                      <span>Service Type:</span>
                      <div className="service-type">
                        <FontAwesomeIcon icon={getServiceIcon(request.service_type)} />
                        {request.service_type || "Service"}
                      </div>
                    </div>
                    <div className="detail-row">
                      <span>Pet:</span>
                      <strong>{request.pet_name || "N/A"}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Scheduled:</span>
                      <strong>
                        {request.scheduled_date ? formatDate(request.scheduled_date) : "Not scheduled"}
                      </strong>
                    </div>
                    <div className="detail-row">
                      <span>Payment Status:</span>
                      <span className={`payment-status ${getStatusBadgeClass(request.payment_status)}`}>
                        {request.payment_status || "pending"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="card-footer">
                  <button 
                    className="view-btn"
                    onClick={() => setSelectedRecord(request)}
                  >
                    <FontAwesomeIcon icon={faEye} />
                    View Details
                  </button>
                </div>
              </div>
            ))}

            {activeTab === "payments" && filteredData.map((payment) => (
              <div key={payment.id} className="history-card payment-card">
                <div className="card-header">
                  <div className="payment-info">
                    <span className="payment-id">#{payment.id}</span>
                    <span className={`status-badge ${getStatusBadgeClass(payment.status)}`}>
                      {payment.status}
                    </span>
                  </div>
                  <div className="payment-date">
                    <FontAwesomeIcon icon={faClock} />
                    {formatDate(payment.created_at)} {formatTime(payment.created_at)}
                  </div>
                </div>
                <div className="card-body">
                  <div className="payment-details">
                    <div className="detail-row">
                      <span>Amount:</span>
                      <strong>{formatCurrency(payment.amount || 0)}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Payment Method:</span>
                      <strong>{payment.payment_method || "N/A"}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Reference:</span>
                      <strong>{payment.reference_id || payment.receipt_number || "N/A"}</strong>
                    </div>
                    {payment.payment_proof && (
                      <div className="detail-row">
                        <span>Proof:</span>
                        <button className="view-proof-btn">View Proof</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="card-footer">
                  <button 
                    className="view-btn"
                    onClick={() => setSelectedRecord(payment)}
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
              <h3>Record Details</h3>
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

export default CustomerHistory;
