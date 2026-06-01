import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import DatePickerInput from "../../components/shared/DatePickerInput";
import {
  faCalendarAlt,
  faCalendarCheck,
  faCheckCircle,
  faChevronLeft,
  faChevronRight,
  faClock,
  faDownload,
  faExclamationTriangle,
  faFilter,
  faRefresh,
  faSearch,
  faSpinner,
  faThumbsDown,
  faThumbsUp,
  faTimes,
  faUserCheck,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import "./ManagerLeave.css";

const LEAVE_TYPES = [
  { value: "sick_leave", label: "Sick Leave", color: "#ef4444" },
  { value: "vacation_leave", label: "Vacation Leave", color: "#3b82f6" },
  { value: "emergency_leave", label: "Emergency Leave", color: "#f59e0b" },
  { value: "maternity_leave", label: "Maternity Leave", color: "#ec4899" },
  { value: "paternity_leave", label: "Paternity Leave", color: "#8b5cf6" },
  { value: "bereavement_leave", label: "Bereavement Leave", color: "#64748b" },
];

const formatLabel = (value) =>
  String(value || "N/A")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

const formatDate = (value) => {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" });
};

const ManagerLeave = () => {
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, on_leave_today: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const [selectedRecord, setSelectedRecord] = useState(null);
  const [actionModal, setActionModal] = useState(null); // 'approve' | 'reject' | null
  const [remarks, setRemarks] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [calendarRecords, setCalendarRecords] = useState([]);
  const [viewMode, setViewMode] = useState("list");

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
    window.clearTimeout(window.managerLeaveToastTimer);
    window.managerLeaveToastTimer = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const loadLeaves = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (silent) setRefreshing(true);
        else setLoading(true);
        setError("");

        const params = new URLSearchParams();
        if (selectedStatus !== "all") params.append("status", selectedStatus);
        if (selectedType !== "all") params.append("type", selectedType);
        if (searchTerm.trim()) params.append("search", searchTerm.trim());

        const res = await apiRequest(`/manager/leaves?${params}`);
        setRecords(res?.data || []);
        setStats(res?.stats || { pending: 0, approved: 0, rejected: 0, on_leave_today: 0 });
      } catch (err) {
        console.error("Leave load error:", err);
        setError(err.message || "Failed to load leave requests.");
        setRecords([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [searchTerm, selectedStatus, selectedType]
  );

  const loadCalendar = useCallback(async () => {
    try {
      const [year, month] = calendarMonth.split("-");
      const res = await apiRequest(`/manager/leaves/calendar?year=${year}&month=${month}`);
      setCalendarRecords(res?.data || []);
    } catch {
      setCalendarRecords([]);
    }
  }, [calendarMonth]);

  useEffect(() => {
    loadLeaves();
  }, [loadLeaves]);

  useEffect(() => {
    if (viewMode === "calendar") loadCalendar();
  }, [viewMode, loadCalendar]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedStatus, selectedType]);

  const filteredRecords = useMemo(() => {
    return records;
  }, [records]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / itemsPerPage));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRecords.slice(start, start + itemsPerPage);
  }, [currentPage, filteredRecords, itemsPerPage]);

  const handleAction = async () => {
    if (!selectedRecord || !actionModal) return;
    setActionLoading(true);
    try {
      await apiRequest(`/manager/leaves/${selectedRecord.id}/${actionModal}`, {
        method: "POST",
        body: JSON.stringify({ remarks }),
      });
      showToast(`Leave request ${actionModal}d.`, "success");
      setRecords((prev) =>
        prev.map((r) =>
          r.id === selectedRecord.id
            ? { ...r, status: actionModal, manager_remarks: remarks }
            : r
        )
      );
      setActionModal(null);
      setRemarks("");
      setSelectedRecord(null);
    } catch (err) {
      console.error("Leave action error:", err);
      setRecords((prev) =>
        prev.map((r) =>
          r.id === selectedRecord.id
            ? { ...r, status: actionModal, manager_remarks: remarks }
            : r
        )
      );
      showToast(`Updated locally. Backend may need verification.`, "warning");
      setActionModal(null);
      setRemarks("");
      setSelectedRecord(null);
    } finally {
      setActionLoading(false);
    }
  };

  const exportCSV = () => {
    if (!records.length) return;
    const headers = ["Employee", "Type", "Start Date", "End Date", "Status", "Reason"];
    const rows = records.map((r) => [
      r.employee_name,
      formatLabel(r.type),
      formatDate(r.start_date),
      formatDate(r.end_date),
      formatLabel(r.status),
      r.reason || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" })),
      download: `manager-leaves-${calendarMonth}.csv`,
    });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const pageStart = filteredRecords.length ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const pageEnd = Math.min(currentPage * itemsPerPage, filteredRecords.length);

  return (
    <div className="manager-leave">
      <section className="manager-leave-hero">
        <div>
          <span className="leave-eyebrow">Manager Leave</span>
          <h1>Leave Management</h1>
          <p>Review, approve, or reject employee leave requests. Track leave types and coverage.</p>
        </div>
        <div className="leave-hero-actions">
          <button type="button" className="leave-btn secondary" onClick={() => loadLeaves({ silent: true })} disabled={loading || refreshing}>
            <FontAwesomeIcon icon={refreshing ? faSpinner : faRefresh} spin={refreshing} />
            Refresh
          </button>
          <button type="button" className="leave-btn primary" onClick={exportCSV}>
            <FontAwesomeIcon icon={faDownload} />
            Export CSV
          </button>
        </div>
      </section>

      {error && (
        <div className="leave-alert error">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>{error}</span>
          <button type="button" onClick={() => loadLeaves()}>Retry</button>
        </div>
      )}

      <section className="leave-summary-grid">
        <SummaryCard label="Pending Requests" value={stats.pending} icon={faClock} tone="warning" />
        <SummaryCard label="Approved" value={stats.approved} icon={faCheckCircle} tone="success" />
        <SummaryCard label="Rejected" value={stats.rejected} icon={faTimes} tone="danger" />
        <SummaryCard label="On Leave Today" value={stats.on_leave_today} icon={faUserCheck} tone="info" />
      </section>

      <section className="leave-controls-card">
        <div className="leave-search-row">
          <div className="leave-search-box">
            <FontAwesomeIcon icon={faSearch} />
            <input type="text" placeholder="Search employee or reason..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            {searchTerm && <button type="button" onClick={() => setSearchTerm("")}><FontAwesomeIcon icon={faXmark} /></button>}
          </div>
          <button type="button" className={`leave-filter-toggle ${showFilters ? "active" : ""}`} onClick={() => setShowFilters((p) => !p)}>
            <FontAwesomeIcon icon={faFilter} /> Filters
          </button>
        </div>
        {showFilters && (
          <div className="leave-filter-grid">
            <FilterField label="Status">
              <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </FilterField>
            <FilterField label="Leave Type">
              <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                <option value="all">All Types</option>
                {LEAVE_TYPES.map((t) => (
                  <option value={t.value} key={t.value}>{t.label}</option>
                ))}
              </select>
            </FilterField>
          </div>
        )}
      </section>

      <div className="leave-view-toggle">
        <button type="button" className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>List</button>
        <button type="button" className={viewMode === "calendar" ? "active" : ""} onClick={() => setViewMode("calendar")}>Calendar</button>
      </div>

      {viewMode === "calendar" ? (
        <CalendarView records={calendarRecords} month={calendarMonth} onMonthChange={setCalendarMonth} />
      ) : (
        <section className="leave-table-card">
          <div className="leave-table-header">
            <div>
              <span className="leave-eyebrow">Leave Requests</span>
              <h2>Employee Leave List</h2>
            </div>
          </div>
          {loading ? (
            <div className="leave-loading-state">
              <FontAwesomeIcon icon={faSpinner} spin />
              <h3>Loading leave requests</h3>
            </div>
          ) : (
            <>
              <div className="leave-table-scroll">
                <table className="leave-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Type</th>
                      <th>Duration</th>
                      <th>Status</th>
                      <th>Reason</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((r) => {
                      const meta = getLeaveTypeMeta(r.type);
                      return (
                        <tr key={r.id}>
                          <td>
                            <div className="leave-employee-cell">
                              <strong>{r.employee_name}</strong>
                              <small>{r.employee_role}</small>
                            </div>
                          </td>
                          <td>
                            <span className="leave-type-badge" style={{ backgroundColor: meta.color + "20", color: meta.color, borderColor: meta.color + "40" }}>
                              {meta.label}
                            </span>
                          </td>
                          <td>
                            <div className="leave-duration-cell">
                              <span>{formatDate(r.start_date)}</span>
                              <small>to {formatDate(r.end_date)}</small>
                            </div>
                          </td>
                          <td><StatusBadge status={r.status} /></td>
                          <td className="leave-reason">{r.reason || "—"}</td>
                          <td>
                            <div className="leave-actions">
                              {r.status === "pending" && (
                                <>
                                  <button type="button" className="approve" onClick={() => { setSelectedRecord(r); setActionModal("approve"); }}>
                                    <FontAwesomeIcon icon={faThumbsUp} /> Approve
                                  </button>
                                  <button type="button" className="reject" onClick={() => { setSelectedRecord(r); setActionModal("reject"); }}>
                                    <FontAwesomeIcon icon={faThumbsDown} /> Reject
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {paginated.length === 0 && (
                <div className="leave-empty-state">
                  <FontAwesomeIcon icon={faCalendarAlt} />
                  <h3>No leave requests found</h3>
                </div>
              )}
              <div className="leave-pagination">
                <p>Showing {pageStart} to {pageEnd} of {filteredRecords.length} records</p>
                <div>
                  <button type="button" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}><FontAwesomeIcon icon={faChevronLeft} /> Previous</button>
                  <span>Page {currentPage} of {totalPages}</span>
                  <button type="button" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>Next <FontAwesomeIcon icon={faChevronRight} /></button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {actionModal && selectedRecord && (
        <div className="leave-modal-overlay">
          <div className="leave-modal">
            <div className="leave-modal-header">
              <div>
                <span className="leave-eyebrow">{actionModal === "approve" ? "Approve Leave" : "Reject Leave"}</span>
                <h2>{selectedRecord.employee_name}</h2>
              </div>
              <button type="button" onClick={() => { setActionModal(null); setSelectedRecord(null); setRemarks(""); }}><FontAwesomeIcon icon={faXmark} /></button>
            </div>
            <div className="leave-modal-body">
              <p>{getLeaveTypeMeta(selectedRecord.type).label} — {formatDate(selectedRecord.start_date)} to {formatDate(selectedRecord.end_date)}</p>
              <label className="leave-remarks-field">
                <span>Manager Remarks (optional)</span>
                <textarea rows={4} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Add remarks..." />
              </label>
            </div>
            <div className="leave-modal-footer">
              <button type="button" className="leave-btn secondary" onClick={() => { setActionModal(null); setSelectedRecord(null); setRemarks(""); }}>Cancel</button>
              <button type="button" className={`leave-btn ${actionModal === "approve" ? "success" : "danger"}`} onClick={handleAction} disabled={actionLoading}>
                <FontAwesomeIcon icon={actionLoading ? faSpinner : actionModal === "approve" ? faThumbsUp : faThumbsDown} spin={actionLoading} />
                {actionLoading ? "Processing..." : actionModal === "approve" ? "Approve" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`leave-toast ${toast.type}`}>
          <FontAwesomeIcon icon={toast.type === "error" ? faExclamationTriangle : faCheckCircle} />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({ label, value, icon, tone }) => (
  <article className={`leave-summary-card ${tone}`}>
    <span><FontAwesomeIcon icon={icon} /></span>
    <div><strong>{value}</strong><p>{label}</p></div>
  </article>
);

const FilterField = ({ label, children }) => (
  <label className="leave-filter-field"><span>{label}</span>{children}</label>
);

const StatusBadge = ({ status }) => {
  const toneMap = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" };
  return <span className={`leave-status ${toneMap[status] || "neutral"}`}>{formatLabel(status)}</span>;
};

const getLeaveTypeMeta = (type) => LEAVE_TYPES.find((t) => t.value === type) || { label: formatLabel(type), color: "#64748b" };

const CalendarView = ({ records, month, onMonthChange }) => {
  const [year, mon] = month.split("-").map(Number);
  const firstDay = new Date(year, mon - 1, 1);
  const lastDay = new Date(year, mon, 0);
  const daysInMonth = lastDay.getDate();
  const startWeekday = firstDay.getDay();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prev = () => { const d = new Date(year, mon - 2, 1); onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };
  const next = () => { const d = new Date(year, mon, 1); onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };

  const byDate = useMemo(() => {
    const m = {};
    records.forEach((r) => {
      const key = String(r.start_date).split("T")[0];
      if (!m[key]) m[key] = [];
      m[key].push(r);
    });
    return m;
  }, [records]);

  return (
    <div className="leave-calendar">
      <div className="leave-calendar-header">
        <button type="button" onClick={prev}><FontAwesomeIcon icon={faChevronLeft} /></button>
        <strong>{firstDay.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}</strong>
        <button type="button" onClick={next}><FontAwesomeIcon icon={faChevronRight} /></button>
      </div>
      <div className="leave-calendar-grid">
        {dayNames.map((d) => <div key={d} className="leave-calendar-dayname">{d}</div>)}
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} className="leave-calendar-cell empty" />;
          const dateKey = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayRecords = byDate[dateKey] || [];
          return (
            <div key={idx} className="leave-calendar-cell">
              <span className="leave-calendar-date">{day}</span>
              <div className="leave-calendar-dots">
                {dayRecords.slice(0, 5).map((r) => {
                  const meta = getLeaveTypeMeta(r.type);
                  return <button key={r.id} type="button" style={{ backgroundColor: meta.color }} title={`${r.employee_name} — ${meta.label}`} />;
                })}
                {dayRecords.length > 5 && <small>+{dayRecords.length - 5}</small>}
              </div>
            </div>
          );
        })}
      </div>
      {records.length === 0 && (
        <div className="leave-empty-state">
          <FontAwesomeIcon icon={faCalendarAlt} />
          <h3>No approved leave for this month</h3>
        </div>
      )}
    </div>
  );
};

export default ManagerLeave;
