import React, { useState, useEffect, useCallback } from "react";
import { showAlert, showError } from "../../utils/alert.jsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHistory,
  faSearch,
  faSpinner,
  faExclamationTriangle,
  faCheckCircle,
  faSignInAlt,
  faSignOutAlt,
  faUser,
  faFilter,
  faDownload,
  faRefresh,
  faEye,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { exportToCSV, exportToPDF, exportToExcel } from "../../utils/reportExport";
import "./LoginHistory.css";

const LoginHistory = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statistics, setStatistics] = useState(null);
  const [showExportDropdown, setShowExportDropdown] = useState(false);

  // Fetch login logs from API
  const fetchLogs = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError("");
      
      const params = new URLSearchParams();
      params.append("page", page);
      if (search) params.append("search", search);
      if (filterAction !== "all") params.append("action", filterAction);
      if (filterStatus !== "all") params.append("status", filterStatus);
      
      const data = await apiRequest(`/admin/login-logs?${params.toString()}`);
      
      setLogs(data.data || []);
      setCurrentPage(data.current_page || 1);
      setTotalPages(data.last_page || 1);
    } catch (err) {
      setError(err.message || "Failed to fetch login logs");
      showError(err.message || "Failed to fetch login logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterAction, filterStatus]);

  // Fetch statistics
  const fetchStatistics = async () => {
    try {
      const data = await apiRequest("/admin/login-logs/statistics?days=30");
      setStatistics(data);
    } catch (err) {
      // Silently handle statistics fetch error
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchStatistics();
  }, [fetchLogs]);

  // Show success message
  const showSuccess = (message) => {
    setSuccess(message);
    setTimeout(() => setSuccess(""), 3000);
  };

  // Handle search
  const handleSearch = () => {
    setCurrentPage(1);
    fetchLogs(1);
  };

  // Handle filter change
  const handleFilterChange = () => {
    setCurrentPage(1);
    fetchLogs(1);
  };

  // Refresh data
  const refreshData = () => {
    fetchLogs(currentPage);
    fetchStatistics();
    showSuccess("Data refreshed successfully");
  };

  // Export logs
  const exportColumns = [
    { key: "id", label: "ID" },
    { key: "user_name", label: "User" },
    { key: "email", label: "Email" },
    { key: "action", label: "Action" },
    { key: "status", label: "Status" },
    { key: "ip_address", label: "IP Address" },
    { key: "created_at", label: "Time" },
  ];

  const handleExport = (format) => {
    setShowExportDropdown(false);
    if (logs.length === 0) {
      showError("No login logs available to export.");
      return;
    }

    const rows = logs.map((log) => ({
      ...log,
      user_name: log.user?.name || "N/A",
      created_at: new Date(log.created_at).toLocaleString(),
    }));

    const filename = `login-logs-${new Date().toISOString().split("T")[0]}`;

    if (format === "csv") {
      exportToCSV(rows, exportColumns, filename);
    } else if (format === "excel") {
      exportToExcel(rows, exportColumns, filename);
    } else if (format === "pdf") {
      exportToPDF(rows, exportColumns, "Login History", filename);
    }

    showSuccess("Logs exported successfully");
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString();
  };

  // Get status badge
  const getStatusBadge = (status) => {
    return status === "success" ? (
      <span className="status-badge success">
        <FontAwesomeIcon icon={faCheckCircle} /> Success
      </span>
    ) : (
      <span className="status-badge failed">
        <FontAwesomeIcon icon={faExclamationTriangle} /> Failed
      </span>
    );
  };

  // Get action icon
  const getActionIcon = (action) => {
    return action === "login" ? (
      <FontAwesomeIcon icon={faSignInAlt} className="action-icon login" />
    ) : (
      <FontAwesomeIcon icon={faSignOutAlt} className="action-icon logout" />
    );
  };

  return (
    <div className="login-history">
      <div className="section-header">
        <div className="header-left">
          <h2>
            <FontAwesomeIcon icon={faHistory} /> Login History
          </h2>
          <p>Track user login and logout activity across the system</p>
        </div>
        <div className="header-actions">
          <button className="action-btn" onClick={refreshData} title="Refresh">
            <FontAwesomeIcon icon={faRefresh} /> Refresh
          </button>
          <div style={{ position: "relative" }}>
            <button className="action-btn" onClick={() => setShowExportDropdown(!showExportDropdown)} title="Export">
              <FontAwesomeIcon icon={faDownload} /> Export ▼
            </button>
            {showExportDropdown && (
              <>
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} onClick={() => setShowExportDropdown(false)} />
                <div style={{ position: "absolute", top: "100%", right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 999, minWidth: 160, overflow: "hidden" }}>
                  <button className="action-btn" style={{ width: "100%", border: "none", background: "#fff", textAlign: "left", padding: "10px 14px" }} onClick={() => handleExport("csv")}>Export as CSV</button>
                  <button className="action-btn" style={{ width: "100%", border: "none", background: "#fff", textAlign: "left", padding: "10px 14px" }} onClick={() => handleExport("excel")}>Export as Excel</button>
                  <button className="action-btn" style={{ width: "100%", border: "none", background: "#fff", textAlign: "left", padding: "10px 14px" }} onClick={() => handleExport("pdf")}>Export as PDF</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="stats-cards">
          <div className="stat-card">
            <h4>Total Logins</h4>
            <p className="stat-value">{statistics.total_logins || 0}</p>
            <small>Last 30 days</small>
          </div>
          <div className="stat-card success">
            <h4>Successful</h4>
            <p className="stat-value">{statistics.successful_logins || 0}</p>
            <small>Successful logins</small>
          </div>
          <div className="stat-card danger">
            <h4>Failed</h4>
            <p className="stat-value">{statistics.failed_logins || 0}</p>
            <small>Failed attempts</small>
          </div>
          <div className="stat-card info">
            <h4>Unique Users</h4>
            <p className="stat-value">{statistics.unique_users || 0}</p>
            <small>Active users</small>
          </div>
        </div>
      )}

      {/* Success/Error Messages */}
      {success && (
        <div className="success-message">
          <FontAwesomeIcon icon={faCheckCircle} /> {success}
        </div>
      )}
      {error && (
        <div className="error-message">
          <FontAwesomeIcon icon={faExclamationTriangle} /> {error}
        </div>
      )}

      {/* Filters */}
      <div className="login-filters">
        <div className="search-filter-group">
          <div className="search-box">
            <FontAwesomeIcon icon={faSearch} />
            <input
              type="text"
              placeholder="Search by user, email, or IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
            />
            <button className="search-btn" onClick={handleSearch}>
              Search
            </button>
          </div>
          <div className="filter-dropdown">
            <FontAwesomeIcon icon={faFilter} />
            <select
              value={filterAction}
              onChange={(e) => {
                setFilterAction(e.target.value);
                handleFilterChange();
              }}
            >
              <option value="all">All Actions</option>
              <option value="login">Login</option>
              <option value="logout">Logout</option>
            </select>
          </div>
          <div className="filter-dropdown">
            <FontAwesomeIcon icon={faFilter} />
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                handleFilterChange();
              }}
            >
              <option value="all">All Status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="login-table-container">
        {loading ? (
          <div className="loading-container">
            <FontAwesomeIcon icon={faSpinner} spin /> Loading login logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <FontAwesomeIcon icon={faHistory} size="3x" />
            <h3>No login logs found</h3>
            <p>Try adjusting your filters or check back later.</p>
          </div>
        ) : (
          <>
            <table className="history-table login-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User</th>
                  <th>Email</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>IP Address</th>
                  <th>Timestamp</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className={`log-row ${log.status}`}>
                    <td className="log-id">#{log.id}</td>
                    <td className="user-info">
                      <div className="user-details">
                        <FontAwesomeIcon icon={faUser} className="user-icon" />
                        <span>{log.user?.name || "Unknown"}</span>
                        {log.user?.role && (
                          <span className="role-badge">{log.user.role}</span>
                        )}
                      </div>
                    </td>
                    <td className="email">{log.email}</td>
                    <td className="action">
                      {getActionIcon(log.action)}
                      <span className="action-text">{log.action}</span>
                    </td>
                    <td className="status">{getStatusBadge(log.status)}</td>
                    <td className="ip-address">{log.ip_address || "N/A"}</td>
                    <td className="timestamp">{formatDate(log.created_at)}</td>
                    <td className="actions">
                      <button
                        className="action-btn view-btn"
                        title="View Details"
                        onClick={() => showAlert(`User Agent: ${log.user_agent || "N/A"}`)}
                      >
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="page-btn"
                  disabled={currentPage === 1}
                  onClick={() => fetchLogs(currentPage - 1)}
                >
                  Previous
                </button>
                <span className="page-info">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="page-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => fetchLogs(currentPage + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LoginHistory;