import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faCalendarAlt,
  faHistory,
  faUser,
  faRobot,
  faBox,
  faMoneyBillWave,
  faClipboardList,
  faSpinner,
  faExclamationTriangle,
  faDownload,
  faEye,
  faSort,
  faShieldAlt,
} from "@fortawesome/free-solid-svg-icons";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { useTheme } from "../../utils/theme";
import "./History.css";

const History = () => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState("activity");
  const [activityLogs, setActivityLogs] = useState([]);
  const [loginLogs, setLoginLogs] = useState([]);
  const [chatbotLogs, setChatbotLogs] = useState([]);
  const [inventoryLogs, setInventoryLogs] = useState([]);
  const [salesLogs, setSalesLogs] = useState([]);
  const [appointmentLogs, setAppointmentLogs] = useState([]);
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
    if (Array.isArray(result?.logs)) return result.logs;
    if (Array.isArray(result?.history)) return result.history;
    if (Array.isArray(result?.records)) return result.records;
    
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

  const getSeverityBadgeClass = (severity) => {
    const severityMap = {
      info: "info",
      warning: "warning",
      error: "error",
      critical: "critical",
      success: "success",
    };
    return severityMap[severity?.toLowerCase()] || "info";
  };

  // Fetch activity logs
  const fetchActivityLogs = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const response = await apiRequest("/admin/activity-logs");
      const logsData = normalizeList(response, ["data", "logs", "history"]);
      
      setActivityLogs(logsData);
      setError("");
    } catch (err) {
      console.error("Failed to fetch activity logs:", err);
      setError(err.message || "Failed to load activity logs");
      setActivityLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch login logs
  const fetchLoginLogs = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const response = await apiRequest("/admin/login-logs");
      const logsData = normalizeList(response, ["data", "logs", "history"]);
      
      setLoginLogs(logsData);
      setError("");
    } catch (err) {
      console.error("Failed to fetch login logs:", err);
      setError(err.message || "Failed to load login logs");
      setLoginLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch chatbot logs
  const fetchChatbotLogs = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const response = await apiRequest("/admin/chatbot/logs");
      const logsData = normalizeList(response, ["data", "logs", "history"]);
      
      setChatbotLogs(logsData);
      setError("");
    } catch (err) {
      console.error("Failed to fetch chatbot logs:", err);
      setError(err.message || "Failed to load chatbot logs");
      setChatbotLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch inventory logs
  const fetchInventoryLogs = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const response = await apiRequest("/inventory/logs");
      const logsData = normalizeList(response, ["data", "logs", "history"]);
      
      setInventoryLogs(logsData);
      setError("");
    } catch (err) {
      console.error("Failed to fetch inventory logs:", err);
      setError(err.message || "Failed to load inventory logs");
      setInventoryLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch sales logs
  const fetchSalesLogs = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const response = await apiRequest("/cashier/transactions");
      const logsData = normalizeList(response, ["data", "logs", "history"]);
      
      setSalesLogs(logsData);
      setError("");
    } catch (err) {
      console.error("Failed to fetch sales logs:", err);
      setError(err.message || "Failed to load sales logs");
      setSalesLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch appointment logs
  const fetchAppointmentLogs = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const response = await apiRequest("/admin/appointments");
      const logsData = normalizeList(response, ["data", "logs", "history"]);
      
      setAppointmentLogs(logsData);
      setError("");
    } catch (err) {
      console.error("Failed to fetch appointment logs:", err);
      setError(err.message || "Failed to load appointment logs");
      setAppointmentLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load data based on active tab
  useEffect(() => {
    switch (activeTab) {
      case "activity":
        fetchActivityLogs();
        break;
      case "login":
        fetchLoginLogs();
        break;
      case "chatbot":
        fetchChatbotLogs();
        break;
      case "inventory":
        fetchInventoryLogs();
        break;
      case "sales":
        fetchSalesLogs();
        break;
      case "appointments":
        fetchAppointmentLogs();
        break;
      default:
        break;
    }
  }, [activeTab, fetchActivityLogs, fetchLoginLogs, fetchChatbotLogs, fetchInventoryLogs, fetchSalesLogs, fetchAppointmentLogs]);

  // Filter and sort data
  const filteredData = useMemo(() => {
    let data = [];
    switch (activeTab) {
      case "activity":
        data = activityLogs;
        break;
      case "login":
        data = loginLogs;
        break;
      case "chatbot":
        data = chatbotLogs;
        break;
      case "inventory":
        data = inventoryLogs;
        break;
      case "sales":
        data = salesLogs;
        break;
      case "appointments":
        data = appointmentLogs;
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
        item.user_id,
        item.user_name,
        item.username,
        item.email,
        item.action,
        item.description,
        item.ip_address,
        item.user_agent,
        item.severity,
        item.status,
        item.product_name,
        item.quantity,
        item.amount,
      ].filter(Boolean).join(' ').toLowerCase();
      
      return searchableFields.includes(searchLower);
    });

    // Apply sorting
    return filtered.sort((a, b) => {
      if (sortBy === "date") {
        const dateA = new Date(a.created_at || a.timestamp || a.date || 0);
        const dateB = new Date(b.created_at || b.timestamp || b.date || 0);
        return dateB - dateA;
      }
      if (sortBy === "user") {
        const userA = (a.user_name || a.username || "").toLowerCase();
        const userB = (b.user_name || b.username || "").toLowerCase();
        return userA.localeCompare(userB);
      }
      return 0;
    });
  }, [activeTab, activityLogs, loginLogs, chatbotLogs, inventoryLogs, salesLogs, appointmentLogs, searchTerm, sortBy]);

  const getTabIcon = (tab) => {
    switch (tab) {
      case "activity": return faHistory;
      case "login": return faUser;
      case "chatbot": return faRobot;
      case "inventory": return faBox;
      case "sales": return faMoneyBillWave;
      case "appointments": return faClipboardList;
      default: return faHistory;
    }
  };

  const getTabLabel = (tab) => {
    switch (tab) {
      case "activity": return "Activity Logs";
      case "login": return "Login Logs";
      case "chatbot": return "Chatbot Logs";
      case "inventory": return "Inventory Logs";
      case "sales": return "Sales Logs";
      case "appointments": return "Appointment Logs";
      default: return "Logs";
    }
  };

  const handleRefresh = () => {
    switch (activeTab) {
      case "activity":
        fetchActivityLogs({ silent: true });
        break;
      case "login":
        fetchLoginLogs({ silent: true });
        break;
      case "chatbot":
        fetchChatbotLogs({ silent: true });
        break;
      case "inventory":
        fetchInventoryLogs({ silent: true });
        break;
      case "sales":
        fetchSalesLogs({ silent: true });
        break;
      case "appointments":
        fetchAppointmentLogs({ silent: true });
        break;
      default:
        break;
    }
  };

  const handleExport = () => {
    // TODO: Implement export functionality
    alert("Export feature coming soon!");
  };

  if (loading) {
    return (
      <div className="admin-history loading">
        <div className="loading-container">
          <FontAwesomeIcon icon={faSpinner} spin className="loading-spinner" />
          <p>Loading system logs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`admin-history ${theme}`}>
      <div className="history-header">
        <div className="header-content">
          <h1>System History</h1>
          <p>Comprehensive audit trail of all system activities and events</p>
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
        {["activity", "login", "chatbot", "inventory", "sales", "appointments"].map((tab) => (
          <button 
            key={tab}
            className={`tab-btn ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            <FontAwesomeIcon icon={getTabIcon(tab)} />
            {getTabLabel(tab)}
          </button>
        ))}
      </div>

      <div className="history-toolbar">
        <div className="search-box">
          <FontAwesomeIcon icon={faSearch} />
          <input
            type="text"
            placeholder={`Search ${getTabLabel(activeTab)}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="toolbar-controls">
          <label>
            <FontAwesomeIcon icon={faSort} />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="date">Sort by Date</option>
              <option value="user">Sort by User</option>
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
            <FontAwesomeIcon icon={faShieldAlt} />
            <h3>No logs found</h3>
            <p>
              {searchTerm 
                ? "Try adjusting your search terms." 
                : `${getTabLabel(activeTab)} will appear here once system activity occurs.`
              }
            </p>
          </div>
        ) : (
          <AnimatePresence>
            <motion.div 
              className="history-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {filteredData.map((record) => (
                <motion.div
                  key={record.id}
                  className="history-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="card-header">
                    <div className="record-info">
                      <span className="record-id">#{record.id}</span>
                      {record.severity && (
                        <span className={`severity-badge ${getSeverityBadgeClass(record.severity)}`}>
                          {record.severity}
                        </span>
                      )}
                    </div>
                    <div className="record-date">
                      <FontAwesomeIcon icon={faCalendarAlt} />
                      {formatDate(record.created_at || record.timestamp)} {formatTime(record.created_at || record.timestamp)}
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="record-details">
                      <div className="detail-row">
                        <span>User:</span>
                        <strong>{record.user_name || record.username || "System"}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Action:</span>
                        <strong>{record.action || record.event_type || "Unknown"}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Description:</span>
                        <span className="description-text">{record.description || record.message || "No description available"}</span>
                      </div>
                      {record.ip_address && (
                        <div className="detail-row">
                          <span>IP Address:</span>
                          <code>{record.ip_address}</code>
                        </div>
                      )}
                      {record.user_agent && (
                        <div className="detail-row">
                          <span>User Agent:</span>
                          <span className="user-agent-text">{record.user_agent}</span>
                        </div>
                      )}
                      {record.product_name && (
                        <div className="detail-row">
                          <span>Product:</span>
                          <strong>{record.product_name}</strong>
                        </div>
                      )}
                      {record.quantity && (
                        <div className="detail-row">
                          <span>Quantity:</span>
                          <strong>{record.quantity}</strong>
                        </div>
                      )}
                      {record.amount && (
                        <div className="detail-row">
                          <span>Amount:</span>
                          <strong>{formatCurrency(record.amount)}</strong>
                        </div>
                      )}
                      {record.status && (
                        <div className="detail-row">
                          <span>Status:</span>
                          <strong>{record.status}</strong>
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
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <AnimatePresence>
        {selectedRecord && (
          <motion.div
            className="modal-overlay"
            onClick={() => setSelectedRecord(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="modal"
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="modal-header">
                <h3>Log Entry Details</h3>
                <button onClick={() => setSelectedRecord(null)}>×</button>
              </div>
              <div className="modal-body">
                <pre>{JSON.stringify(selectedRecord, null, 2)}</pre>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default History;
