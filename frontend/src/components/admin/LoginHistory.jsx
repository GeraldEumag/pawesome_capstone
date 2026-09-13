import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { showSuccess as showSwalSuccess, showError as showSwalError } from "../../utils/alert.jsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRotateRight,
  faCheckCircle,
  faCircleInfo,
  faClockRotateLeft,
  faDesktop,
  faDownload,
  faEye,
  faRightToBracket,
  faShieldHalved,
  faSignal,
  faSpinner,
  faTimes,
  faTriangleExclamation,
  faUserCheck,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { exportToCSV, exportToPDF, exportToExcel } from "../../utils/reportExport";
import "./LoginHistory.css";

const STAFF_ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
  { value: "manager", label: "Manager" },
  { value: "receptionist", label: "Receptionist" },
  { value: "super_receptionist", label: "Super Receptionist" },
  { value: "veterinary", label: "Veterinary" },
  { value: "cashier", label: "Cashier" },
  { value: "inventory", label: "Inventory" },
];

const AUTO_REFRESH_MS = 30000;

const getUserInitials = (name = "") => {
  const parts = String(name || "U").trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
};

const formatDateTime = (dateString) => {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (start, end) => {
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : Date.now();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return "—";

  const minutes = Math.floor((to - from) / 60000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  return `${hours}h ${minutes % 60}m`;
};

const parseDevice = (userAgent = "") => {
  if (!userAgent) return "Unknown device";
  const ua = String(userAgent);

  let browser = "Other browser";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\//i.test(ua)) browser = "Opera";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua)) browser = "Safari";

  let os = "Other OS";
  if (/windows nt/i.test(ua)) os = "Windows";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/mac os x/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua)) os = "Linux";

  return `${browser} · ${os}`;
};

const isActiveSession = (log) =>
  log.action === "login" && log.status === "success" && !log.logged_out_at;

const LoginHistory = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [perPage, setPerPage] = useState(25);

  const [statistics, setStatistics] = useState(null);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  const filtersRef = useRef({});
  filtersRef.current = {
    debouncedSearch,
    filterAction,
    filterStatus,
    filterRole,
    dateFrom,
    dateTo,
    perPage,
    currentPage,
  };

  const showSuccess = (message) => {
    setSuccess(message);
    window.clearTimeout(window.loginHistorySuccessTimer);
    window.loginHistorySuccessTimer = window.setTimeout(() => setSuccess(""), 3000);
    showSwalSuccess(message);
  };

  const showError = (message) => {
    setError(message);
    window.clearTimeout(window.loginHistoryErrorTimer);
    window.loginHistoryErrorTimer = window.setTimeout(() => setError(""), 5000);
    showSwalError(message);
  };

  const buildParams = (page, overrides = {}) => {
    const f = { ...filtersRef.current, ...overrides };
    const params = new URLSearchParams();
    params.append("scope", "staff");
    params.append("page", page);
    params.append("per_page", f.perPage);
    if (f.debouncedSearch) params.append("search", f.debouncedSearch);
    if (f.filterAction !== "all") params.append("action", f.filterAction);
    if (f.filterStatus !== "all") params.append("status", f.filterStatus);
    if (f.filterRole !== "all") params.append("role", f.filterRole);
    if (f.dateFrom) params.append("date_from", f.dateFrom);
    if (f.dateTo) params.append("date_to", f.dateTo);
    return params;
  };

  const fetchLogs = useCallback(
    async (page = 1, { silent = false } = {}) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError("");

        const data = await apiRequest(`/admin/login-logs?${buildParams(page).toString()}`);

        setLogs(data.data || []);
        setCurrentPage(data.current_page || 1);
        setTotalPages(data.last_page || 1);
        setTotalLogs(data.total || 0);
      } catch (err) {
        setError(err.message || "Failed to fetch login logs");
        if (!silent) showSwalError(err.message || "Failed to fetch login logs");
        setLogs([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  const fetchStatistics = useCallback(async () => {
    try {
      const data = await apiRequest("/admin/login-logs/statistics?days=30&scope=staff");
      setStatistics(data);
    } catch (err) {
      // Statistics are non-critical — leave cards empty on failure
    }
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setCurrentPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Fetch when filters or page change
  useEffect(() => {
    fetchLogs(currentPage);
  }, [currentPage, debouncedSearch, filterAction, filterStatus, filterRole, dateFrom, dateTo, perPage, fetchLogs]);

  // Initial stats load
  useEffect(() => {
    fetchStatistics();
  }, [fetchStatistics]);

  // Auto-refresh every 30s (skipped while the tab is hidden)
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchLogs(filtersRef.current.currentPage, { silent: true });
        fetchStatistics();
      }
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [fetchLogs, fetchStatistics]);

  const applyFilter = (setter) => (event) => {
    setter(event.target.value);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setFilterAction("all");
    setFilterStatus("all");
    setFilterRole("all");
    setDateFrom("");
    setDateTo("");
    setCurrentPage(1);
    showSuccess("Filters cleared.");
  };

  const refreshData = () => {
    fetchLogs(currentPage);
    fetchStatistics();
    showSuccess("Data refreshed successfully");
  };

  const exportColumns = [
    { key: "id", label: "ID" },
    { key: "user_name", label: "Employee" },
    { key: "role", label: "Role" },
    { key: "email", label: "Email" },
    { key: "action", label: "Action" },
    { key: "status", label: "Status" },
    { key: "ip_address", label: "IP Address" },
    { key: "device", label: "Device" },
    { key: "created_at", label: "Time" },
    { key: "logged_out_at", label: "Logged Out At" },
  ];

  const handleExport = async (format) => {
    setShowExportDropdown(false);

    try {
      // Export all filtered rows (capped), not just the visible page
      const params = buildParams(1, { perPage: 500 });
      const data = await apiRequest(`/admin/login-logs?${params.toString()}`);
      const exportLogs = data.data || [];

      if (exportLogs.length === 0) {
        showError("No login logs available to export.");
        return;
      }

      const rows = exportLogs.map((log) => ({
        ...log,
        user_name: log.user?.name || "Unknown",
        role: log.user?.role || "N/A",
        device: parseDevice(log.user_agent),
        created_at: formatDateTime(log.created_at),
        logged_out_at: log.logged_out_at ? formatDateTime(log.logged_out_at) : "—",
      }));

      const filename = `staff-login-history-${new Date().toISOString().split("T")[0]}`;

      if (format === "csv") {
        exportToCSV(rows, exportColumns, filename);
      } else if (format === "excel") {
        exportToExcel(rows, exportColumns, filename);
      } else if (format === "pdf") {
        exportToPDF(rows, exportColumns, "Staff Login History", filename);
      }

      showSuccess("Logs exported successfully");
    } catch (err) {
      showError(err.message || "Failed to export login logs.");
    }
  };

  const stats = useMemo(
    () => ({
      total: statistics?.total_logins ?? 0,
      active: statistics?.active_sessions ?? 0,
      unique: statistics?.unique_users ?? 0,
      today: statistics?.logins_today ?? 0,
    }),
    [statistics]
  );

  return (
    <div className="login-history">
      {success && (
        <div className="lh-toast success">
          <FontAwesomeIcon icon={faCheckCircle} />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="lh-toast error">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <span>{error}</span>
        </div>
      )}

      <section className="lh-header">
        <div className="lh-header-copy">
          <span className="lh-eyebrow">
            <FontAwesomeIcon icon={faShieldHalved} />
            Security Monitoring
          </span>
          <h1>Staff Login History</h1>
          <p>
            Monitor employee sign-ins, active sessions, and access activity across
            the system. Updates automatically every 30 seconds.
          </p>
        </div>

        <div className="lh-header-actions">
          <button
            type="button"
            className={`lh-secondary-btn ${refreshing ? "refreshing" : ""}`}
            onClick={refreshData}
            disabled={refreshing}
          >
            <FontAwesomeIcon icon={refreshing ? faSpinner : faArrowRotateRight} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

          <div className="lh-export-wrap">
            <button
              type="button"
              className="lh-secondary-btn"
              onClick={() => setShowExportDropdown(!showExportDropdown)}
            >
              <FontAwesomeIcon icon={faDownload} />
              Export ▾
            </button>
            {showExportDropdown && (
              <>
                <div
                  className="lh-export-backdrop"
                  onClick={() => setShowExportDropdown(false)}
                />
                <div className="lh-export-menu">
                  <button type="button" onClick={() => handleExport("csv")}>
                    Export as CSV
                  </button>
                  <button type="button" onClick={() => handleExport("excel")}>
                    Export as Excel
                  </button>
                  <button type="button" onClick={() => handleExport("pdf")}>
                    Export as PDF
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="lh-stats-grid">
        <article className="lh-stat-card">
          <span>
            <FontAwesomeIcon icon={faRightToBracket} />
          </span>
          <div>
            <strong>{stats.total}</strong>
            <p>Staff Logins (30d)</p>
          </div>
        </article>

        <article className="lh-stat-card success">
          <span>
            <FontAwesomeIcon icon={faSignal} />
          </span>
          <div>
            <strong>{stats.active}</strong>
            <p>Active Sessions</p>
          </div>
        </article>

        <article className="lh-stat-card info">
          <span>
            <FontAwesomeIcon icon={faUsers} />
          </span>
          <div>
            <strong>{stats.unique}</strong>
            <p>Unique Staff (30d)</p>
          </div>
        </article>

        <article className="lh-stat-card">
          <span>
            <FontAwesomeIcon icon={faUserCheck} />
          </span>
          <div>
            <strong>{stats.today}</strong>
            <p>Logins Today</p>
          </div>
        </article>
      </section>

      <section className="lh-filter-bar">
        <div className="lh-search-box">
          <input
            type="text"
            placeholder="Search by name, email, or IP address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="lh-search-clear"
              onClick={() => {
                setSearch("");
                setDebouncedSearch("");
                setCurrentPage(1);
              }}
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>

        <div className="lh-filter-box">
          <select value={filterAction} onChange={applyFilter(setFilterAction)}>
            <option value="all">All Actions</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
          </select>
        </div>

        <div className="lh-filter-box">
          <select value={filterRole} onChange={applyFilter(setFilterRole)}>
            <option value="all">All Staff Roles</option>
            {STAFF_ROLE_OPTIONS.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </div>

        <div className="lh-filter-box">
          <select value={filterStatus} onChange={applyFilter(setFilterStatus)}>
            <option value="all">All Status</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div className="lh-date-box">
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="From date"
          />
          <span>→</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => {
              setDateTo(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="To date"
          />
        </div>

        <button type="button" className="lh-clear-btn" onClick={clearFilters}>
          <FontAwesomeIcon icon={faTimes} />
          Clear
        </button>
      </section>

      <section className="lh-table-container">
        <div className="lh-table-header">
          <div>
            <h2>Login Activity</h2>
            <p>
              Showing <strong>{logs.length}</strong> of{" "}
              <strong>{totalLogs}</strong> staff records
            </p>
          </div>
        </div>

        {loading ? (
          <div className="lh-state">
            <FontAwesomeIcon icon={faSpinner} className="lh-spin" />
            <h3>Loading login logs...</h3>
            <p>Please wait while we fetch staff activity.</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="lh-state">
            <FontAwesomeIcon icon={faClockRotateLeft} />
            <h3>No login logs found</h3>
            <p>Try adjusting your filters or check back later.</p>
          </div>
        ) : (
          <>
            <div className="lh-table-scroll">
              <table className="lh-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>IP Address</th>
                    <th>Device</th>
                    <th>Time</th>
                    <th>Session</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const online = isActiveSession(log);
                    return (
                      <tr key={log.id} className={online ? "lh-online-row" : ""}>
                        <td>
                          <div className="lh-employee">
                            <span className="lh-avatar">
                              {getUserInitials(log.user?.name)}
                            </span>
                            <div>
                              <strong>{log.user?.name || "Unknown"}</strong>
                              <small>{log.email}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`lh-role-badge role-${log.user?.role || "default"}`}>
                            {log.user?.role || "—"}
                          </span>
                        </td>
                        <td>
                          <span className={`lh-action ${log.action}`}>
                            {log.action === "login" ? "Login" : "Logout"}
                          </span>
                        </td>
                        <td className="lh-mono">{log.ip_address || "N/A"}</td>
                        <td className="lh-device">
                          <FontAwesomeIcon icon={faDesktop} />
                          <span>{parseDevice(log.user_agent)}</span>
                        </td>
                        <td className="lh-time">{formatDateTime(log.created_at)}</td>
                        <td>
                          {log.action === "logout" ? (
                            <span className="lh-session-none">—</span>
                          ) : online ? (
                            <span className="lh-online">
                              <span className="lh-pulse" />
                              Online now
                            </span>
                          ) : (
                            <span className="lh-duration">
                              {formatDuration(log.created_at, log.logged_out_at)}
                            </span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="lh-view-btn"
                            title="View details"
                            onClick={() => setSelectedLog(log)}
                          >
                            <FontAwesomeIcon icon={faEye} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="lh-pagination">
              <div className="lh-per-page">
                <label htmlFor="lh-per-page">Rows:</label>
                <select
                  id="lh-per-page"
                  value={perPage}
                  onChange={(e) => {
                    setPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div className="lh-page-controls">
                <button
                  type="button"
                  className="lh-page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="lh-page-info">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="lh-page-btn"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {selectedLog && (
        <div className="lh-modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="lh-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lh-modal-header">
              <div>
                <span className="lh-eyebrow">
                  <FontAwesomeIcon icon={faCircleInfo} />
                  Session Details
                </span>
                <h3>{selectedLog.user?.name || "Unknown User"}</h3>
              </div>
              <button
                type="button"
                className="lh-close-btn"
                onClick={() => setSelectedLog(null)}
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="lh-modal-body">
              <div className="lh-detail-top">
                <span className="lh-detail-avatar">
                  {getUserInitials(selectedLog.user?.name)}
                </span>
                <div>
                  <h4>{selectedLog.user?.name || "Unknown"}</h4>
                  <p>{selectedLog.email || "No email"}</p>
                </div>
              </div>

              <div className="lh-detail-grid">
                <div>
                  <small>Action</small>
                  <strong>{selectedLog.action}</strong>
                </div>
                <div>
                  <small>Status</small>
                  <strong>{selectedLog.status}</strong>
                </div>
                <div>
                  <small>Role</small>
                  <strong>{selectedLog.user?.role || "—"}</strong>
                </div>
                <div>
                  <small>IP Address</small>
                  <strong>{selectedLog.ip_address || "N/A"}</strong>
                </div>
                <div>
                  <small>Login Time</small>
                  <strong>{formatDateTime(selectedLog.created_at)}</strong>
                </div>
                <div>
                  <small>Logged Out</small>
                  <strong>
                    {selectedLog.logged_out_at
                      ? formatDateTime(selectedLog.logged_out_at)
                      : isActiveSession(selectedLog)
                      ? "Still active"
                      : "—"}
                  </strong>
                </div>
                <div>
                  <small>Session Duration</small>
                  <strong>
                    {selectedLog.action === "login"
                      ? isActiveSession(selectedLog)
                        ? `${formatDuration(selectedLog.created_at, null)} (ongoing)`
                        : formatDuration(selectedLog.created_at, selectedLog.logged_out_at)
                      : "—"}
                  </strong>
                </div>
                <div>
                  <small>Device</small>
                  <strong>{parseDevice(selectedLog.user_agent)}</strong>
                </div>
              </div>

              <div className="lh-detail-ua">
                <small>User Agent</small>
                <code>{selectedLog.user_agent || "N/A"}</code>
              </div>
            </div>

            <div className="lh-modal-actions">
              <button
                type="button"
                className="lh-secondary-btn"
                onClick={() => setSelectedLog(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginHistory;
