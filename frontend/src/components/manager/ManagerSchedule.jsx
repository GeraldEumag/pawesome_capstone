import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarAlt,
  faCheckCircle,
  faChevronLeft,
  faChevronRight,
  faClock,
  faCopy,
  faExclamationTriangle,
  faMoon,
  faRefresh,
  faSave,
  faSearch,
  faSpinner,
  faSun,
  faTimes,
  faTrash,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import "./ManagerSchedule.css";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ROLE_COLORS = {
  manager: "#7c3aed",
  cashier: "#0891b2",
  receptionist: "#d97706",
  veterinary: "#059669",
  inventory: "#ea580c",
  payroll: "#7c3aed",
  staff: "#3b82f6",
  groomer: "#ec4899",
  default: "#64748b",
};

const getRoleColor = (role) => ROLE_COLORS[(role || "").toLowerCase().replace(/\s+/g, "_")] || ROLE_COLORS.default;

const formatTime = (value) => {
  if (!value) return "—";
  const text = String(value);
  if (text.includes(":")) return text;
  return text;
};

const ManagerSchedule = () => {
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentWeek, setCurrentWeek] = useState(0);

  const [editModal, setEditModal] = useState(null); // { user_id, day_of_week, existing }
  const [editForm, setEditForm] = useState({ shift_start: "", shift_end: "", is_off_day: false });
  const [saving, setSaving] = useState(false);

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
    window.clearTimeout(window.managerScheduleToastTimer);
    window.managerScheduleToastTimer = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const loadSchedules = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (silent) setRefreshing(true);
        else setLoading(true);
        setError("");
        const res = await apiRequest("/manager/schedules");
        setRecords(res?.data || []);
        setEmployees(res?.employees || []);
      } catch (err) {
        console.error("Schedule load error:", err);
        setError(err.message || "Failed to load schedules.");
        setRecords([]);
        setEmployees([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  const filteredEmployees = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return employees.filter((e) =>
      !term || [e.name, e.role, e.department].join(" ").toLowerCase().includes(term)
    );
  }, [employees, searchTerm]);

  const scheduleMap = useMemo(() => {
    const m = {};
    records.forEach((r) => {
      const key = `${r.user_id}-${r.day_of_week}`;
      m[key] = r;
    });
    return m;
  }, [records]);

  const openEdit = (user_id, day_of_week) => {
    const key = `${user_id}-${day_of_week}`;
    const existing = scheduleMap[key];
    setEditModal({ user_id, day_of_week, existing: existing || null });
    setEditForm({
      shift_start: existing ? existing.shift_start || "" : "",
      shift_end: existing ? existing.shift_end || "" : "",
      is_off_day: existing ? Boolean(existing.is_off_day) : false,
    });
  };

  const saveEdit = async () => {
    if (!editModal) return;
    setSaving(true);
    try {
      await apiRequest("/manager/schedules", {
        method: "POST",
        body: JSON.stringify({
          user_id: editModal.user_id,
          day_of_week: editModal.day_of_week,
          shift_start: editForm.is_off_day ? null : editForm.shift_start,
          shift_end: editForm.is_off_day ? null : editForm.shift_end,
          is_off_day: editForm.is_off_day,
        }),
      });
      showToast("Schedule saved.", "success");
      setEditModal(null);
      loadSchedules({ silent: true });
    } catch (err) {
      console.error("Save schedule error:", err);
      showToast("Updated locally. Backend may need verification.", "warning");
      // Optimistically update
      const newRecord = {
        id: editModal.existing?.id || Date.now(),
        user_id: editModal.user_id,
        day_of_week: editModal.day_of_week,
        shift_start: editForm.is_off_day ? null : editForm.shift_start,
        shift_end: editForm.is_off_day ? null : editForm.shift_end,
        is_off_day: editForm.is_off_day ? 1 : 0,
        employee_name: employees.find((e) => e.id === editModal.user_id)?.name || "",
        employee_role: employees.find((e) => e.id === editModal.user_id)?.role || "",
      };
      setRecords((prev) => {
        const filtered = prev.filter((r) => !(r.user_id === editModal.user_id && r.day_of_week === editModal.day_of_week));
        return [...filtered, newRecord];
      });
      setEditModal(null);
    } finally {
      setSaving(false);
    }
  };

  const deleteSchedule = async (id) => {
    try {
      await apiRequest(`/manager/schedules/${id}`, { method: "DELETE" });
      setRecords((prev) => prev.filter((r) => r.id !== id));
      showToast("Schedule removed.", "success");
    } catch (err) {
      console.error("Delete schedule error:", err);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      showToast("Removed locally. Backend may need verification.", "warning");
    }
  };

  const copyFromPreviousWeek = () => {
    showToast("Copy schedule feature requires backend support for week-based storage.", "warning");
  };

  const weekLabel = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() + currentWeek * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${start.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`;
  }, [currentWeek]);

  return (
    <div className="manager-schedule">
      <section className="manager-schedule-hero">
        <div>
          <span className="schedule-eyebrow">Manager Schedule</span>
          <h1>Work Scheduling</h1>
          <p>Assign and manage employee shifts across the week. Click any cell to edit a shift or mark as day-off.</p>
        </div>
        <div className="schedule-hero-actions">
          <button type="button" className="schedule-btn secondary" onClick={() => loadSchedules({ silent: true })} disabled={loading || refreshing}>
            <FontAwesomeIcon icon={refreshing ? faSpinner : faRefresh} spin={refreshing} />
            Refresh
          </button>
          <button type="button" className="schedule-btn primary" onClick={copyFromPreviousWeek}>
            <FontAwesomeIcon icon={faCopy} />
            Copy Week
          </button>
        </div>
      </section>

      {error && (
        <div className="schedule-alert error">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>{error}</span>
          <button type="button" onClick={() => loadSchedules()}>Retry</button>
        </div>
      )}

      <section className="schedule-week-bar">
        <div className="schedule-week-nav">
          <button type="button" onClick={() => setCurrentWeek((p) => p - 1)}><FontAwesomeIcon icon={faChevronLeft} /></button>
          <strong><FontAwesomeIcon icon={faCalendarAlt} /> {weekLabel}</strong>
          <button type="button" onClick={() => setCurrentWeek((p) => p + 1)}><FontAwesomeIcon icon={faChevronRight} /></button>
        </div>
        <div className="schedule-search-box">
          <FontAwesomeIcon icon={faSearch} />
          <input type="text" placeholder="Search employee, role, department..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          {searchTerm && <button type="button" onClick={() => setSearchTerm("")}><FontAwesomeIcon icon={faXmark} /></button>}
        </div>
      </section>

      <section className="schedule-grid-card">
        {loading ? (
          <div className="schedule-loading-state">
            <FontAwesomeIcon icon={faSpinner} spin />
            <h3>Loading schedules</h3>
          </div>
        ) : (
          <div className="schedule-table-scroll">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th className="schedule-employee-header">Employee</th>
                  {DAY_SHORT.map((d) => (
                    <th key={d}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id}>
                    <td className="schedule-employee-cell">
                      <span className="schedule-avatar" style={{ backgroundColor: getRoleColor(emp.role) }}>
                        {emp.name.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <strong>{emp.name}</strong>
                        <small>{emp.role}</small>
                      </div>
                    </td>
                    {DAYS.map((_, dayIdx) => {
                      const key = `${emp.id}-${dayIdx}`;
                      const s = scheduleMap[key];
                      const isOff = s?.is_off_day;
                      return (
                        <td key={dayIdx} className="schedule-shift-cell" onClick={() => openEdit(emp.id, dayIdx)}>
                          {s ? (
                            <div className={`schedule-shift-tag ${isOff ? "off" : ""}`}>
                              {isOff ? (
                                <><FontAwesomeIcon icon={faMoon} /> <small>Off</small></>
                              ) : (
                                <>
                                  <FontAwesomeIcon icon={faClock} />
                                  <small>{formatTime(s.shift_start)}</small>
                                  <small>{formatTime(s.shift_end)}</small>
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="schedule-shift-empty">
                              <FontAwesomeIcon icon={faSun} />
                              <small>Assign</small>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={8} className="schedule-empty-row">
                      <FontAwesomeIcon icon={faUsers} />
                      <span>No employees found.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editModal && (
        <div className="schedule-modal-overlay">
          <div className="schedule-modal">
            <div className="schedule-modal-header">
              <div>
                <span className="schedule-eyebrow">Edit Shift</span>
                <h2>
                  {employees.find((e) => e.id === editModal.user_id)?.name} — {DAYS[editModal.day_of_week]}
                </h2>
              </div>
              <button type="button" onClick={() => setEditModal(null)}><FontAwesomeIcon icon={faXmark} /></button>
            </div>
            <div className="schedule-modal-body">
              <label className="schedule-toggle">
                <input type="checkbox" checked={editForm.is_off_day} onChange={(e) => setEditForm((p) => ({ ...p, is_off_day: e.target.checked }))} />
                <span>Day Off</span>
              </label>
              {!editForm.is_off_day && (
                <>
                  <label className="schedule-field">
                    <span>Shift Start</span>
                    <input type="time" value={editForm.shift_start} onChange={(e) => setEditForm((p) => ({ ...p, shift_start: e.target.value }))} />
                  </label>
                  <label className="schedule-field">
                    <span>Shift End</span>
                    <input type="time" value={editForm.shift_end} onChange={(e) => setEditForm((p) => ({ ...p, shift_end: e.target.value }))} />
                  </label>
                </>
              )}
            </div>
            <div className="schedule-modal-footer">
              {editModal.existing && (
                <button type="button" className="schedule-btn danger" onClick={() => { deleteSchedule(editModal.existing.id); setEditModal(null); }}>
                  <FontAwesomeIcon icon={faTrash} /> Remove
                </button>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
                <button type="button" className="schedule-btn secondary" onClick={() => setEditModal(null)}>Cancel</button>
                <button type="button" className="schedule-btn primary" onClick={saveEdit} disabled={saving}>
                  <FontAwesomeIcon icon={saving ? faSpinner : faSave} spin={saving} />
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`schedule-toast ${toast.type}`}>
          <FontAwesomeIcon icon={toast.type === "error" ? faExclamationTriangle : faCheckCircle} />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};

export default ManagerSchedule;
