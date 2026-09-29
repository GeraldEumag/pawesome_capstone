import React, { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClockRotateLeft,
  faShieldHalved,
  faUser,
  faCalendarAlt,
  faPrint,
  faChartBar,
  faCircleCheck,
  faCircleExclamation,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import "./DTRReport.css";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DTRReport = () => {
  const [userId, setUserId]       = useState("");
  const [users, setUsers]         = useState([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 8) + "01");
  const [endDate, setEndDate]     = useState(new Date().toISOString().slice(0, 10));
  const [records, setRecords]     = useState(null);
  const [employee, setEmployee]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const printRef                  = useRef();

  const loadUsers = () => {
    if (users.length) return;
    apiRequest("/manager/staff").then((res) => setUsers(res?.data || [])).catch(() => {});
  };

  const generate = async () => {
    if (!userId) { setError("Select a staff member."); return; }
    setLoading(true); setError("");
    try {
      const res = await apiRequest(
        `/manager/reports/dtr?user_id=${userId}&start_date=${startDate}&end_date=${endDate}`
      );
      setRecords(res?.data || []);
      // find employee info for header
      const found = users.find((u) => String(u.id) === String(userId));
      setEmployee(found || null);
    } catch (e) {
      setError(e.message || "Failed to load DTR.");
    } finally {
      setLoading(false);
    }
  };

  const print = () => {
    const win = window.open("", "_blank");
    win.document.write(
      `<html><head><title>DTR — ${employee?.name || ""}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; margin: 1cm; }
        h2 { font-size: 14px; margin: 0 0 4px; }
        .meta { font-size: 10px; color: #555; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border: 1px solid #ccc; padding: 5px 7px; font-size: 10px; }
        th { background: #f3f4f6; font-weight: bold; }
        .absent { background: #fff5f5; }
        .late-in { color: #b45309; }
        footer { font-size: 9px; color: #888; margin-top: 8px; }
      </style></head><body>`
    );
    win.document.write(printRef.current.innerHTML);
    win.document.write("</body></html>");
    win.document.close();
    win.print();
  };

  // Computed stats
  const stats = records
    ? {
        total:   records.length,
        present: records.filter((r) => ["present", "late", "early_leave"].includes(r.status)).length,
        late:    records.filter((r) => r.is_late).length,
        absent:  records.filter((r) => r.status === "absent").length,
        leave:   records.filter((r) => r.status === "on_leave").length,
      }
    : null;

  const dayLabel = (r) => {
    try { return DAYS[new Date(r.date + "T00:00").getDay()]; } catch { return "—"; }
  };

  return (
    <div className="dtr-page">
      {/* Hero */}
      <div className="dtr-hero">
        <div className="dtr-hero-left">
          <div className="dtr-eyebrow">
            <FontAwesomeIcon icon={faClockRotateLeft} />
            Daily Time Record
          </div>
          <h1>DTR Report</h1>
          <p>Per-employee attendance time log for payroll computation and DOLE compliance.</p>
          <div className="dtr-dole-badge">
            <FontAwesomeIcon icon={faShieldHalved} />
            DOLE Labor Code Compliance
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="dtr-controls-card">
        <div className="dtr-control-field">
          <label>Staff Member</label>
          <select
            value={userId}
            onFocus={loadUsers}
            onChange={(e) => { setUserId(e.target.value); setRecords(null); }}
            className="dtr-input"
          >
            <option value="">— Select —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
            ))}
          </select>
        </div>

        <div className="dtr-control-field">
          <label>From</label>
          <input
            type="date"
            className="dtr-input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="dtr-control-field">
          <label>To</label>
          <input
            type="date"
            className="dtr-input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <button className="dtr-btn primary" onClick={generate} disabled={loading}>
          <FontAwesomeIcon icon={faChartBar} />
          {loading ? "Generating…" : "Generate DTR"}
        </button>

        {records && (
          <button className="dtr-btn secondary" onClick={print}>
            <FontAwesomeIcon icon={faPrint} />
            Print
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="dtr-alert">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          {error}
        </div>
      )}

      {/* Printable section */}
      {records && (
        <div ref={printRef}>
          {/* Employee Info Card */}
          <div className="dtr-info-card">
            <p className="dtr-info-name">
              <FontAwesomeIcon icon={faUser} style={{ marginRight: "0.5rem", opacity: 0.5 }} />
              {employee?.name || "Employee"}
            </p>
            <div className="dtr-info-meta">
              <span>
                <FontAwesomeIcon icon={faCalendarAlt} />
                Period: <strong>{startDate}</strong> — <strong>{endDate}</strong>
              </span>
              {employee?.role && (
                <span>Role: <strong style={{ textTransform: "capitalize" }}>{employee.role}</strong></span>
              )}
              <span>Generated: <strong>{new Date().toLocaleDateString("en-PH")}</strong></span>
            </div>
          </div>

          {/* Micro-stat chips */}
          {stats && (
            <div className="dtr-chips">
              <span className="dtr-chip total">
                <span className="dtr-chip-num">{stats.total}</span> Total Days
              </span>
              <span className="dtr-chip present">
                <FontAwesomeIcon icon={faCircleCheck} />
                <span className="dtr-chip-num">{stats.present}</span> Present
              </span>
              <span className="dtr-chip late">
                <span className="dtr-chip-num">{stats.late}</span> Late
              </span>
              <span className="dtr-chip absent">
                <FontAwesomeIcon icon={faCircleExclamation} />
                <span className="dtr-chip-num">{stats.absent}</span> Absent
              </span>
              {stats.leave > 0 && (
                <span className="dtr-chip leave">
                  <span className="dtr-chip-num">{stats.leave}</span> On Leave
                </span>
              )}
            </div>
          )}

          {/* Table */}
          <div className="dtr-table-card">
            <table className="dtr-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day</th>
                  <th>Time In</th>
                  <th>Time Out</th>
                  <th>Hours</th>
                  <th>OT</th>
                  <th>Late (min)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", color: "var(--dtr-muted)", padding: "3rem" }}>
                      No records found for this period.
                    </td>
                  </tr>
                ) : (
                  records.map((r, i) => (
                    <tr key={i} className={r.status === "absent" ? "dtr-row-absent" : ""}>
                      <td style={{ fontWeight: 750 }}>{r.date}</td>
                      <td style={{ color: "var(--dtr-muted)" }}>{r.day_of_week || dayLabel(r)}</td>
                      <td className={r.is_late ? "dtr-late-in" : ""}>{r.check_in || "—"}</td>
                      <td>{r.check_out || "—"}</td>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.total_hours || "—"}</td>
                      <td className={r.overtime_hours > 0 ? "dtr-ot" : ""}>
                        {r.overtime_hours > 0 ? r.overtime_hours : "—"}
                      </td>
                      <td style={{ color: r.late_minutes > 0 ? "var(--dtr-warning)" : undefined, fontWeight: r.late_minutes > 0 ? 950 : 600 }}>
                        {r.late_minutes > 0 ? r.late_minutes : "—"}
                      </td>
                      <td>
                        <span className={`dtr-status-pill ${r.status}`}>
                          {r.status?.replace(/_/g, " ") || "—"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="dtr-footer">
            Total Records: {records.length} &nbsp;·&nbsp; Generated on {new Date().toLocaleDateString("en-PH")} &nbsp;·&nbsp; DAILY TIME RECORD — For DOLE Compliance
          </p>
        </div>
      )}
    </div>
  );
};

export default DTRReport;
