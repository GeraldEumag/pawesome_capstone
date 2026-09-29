import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClockRotateLeft,
  faShieldHalved,
  faUser,
  faCalendarAlt,
  faDownload,
  faChartBar,
  faCircleCheck,
  faCircleExclamation,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { exportFormalReportPDF } from "../../utils/formalReportPdf";
import { getRole, getUserData } from "../../utils/auth";
import "./DTRReport.css";

// Returns today as "YYYY-MM" string in local time (avoids UTC drift)
const todayYM = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Given "YYYY-MM" + period preset, compute [startDate, endDate] as "YYYY-MM-DD"
const periodDates = (ym, preset) => {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate(); // last day of month
  if (preset === "first")  return [`${ym}-01`, `${ym}-15`];
  if (preset === "second") return [`${ym}-16`, `${ym}-${String(lastDay).padStart(2, "0")}`];
  // "whole"
  return [`${ym}-01`, `${ym}-${String(lastDay).padStart(2, "0")}`];
};

const DTRReport = () => {
  const [userId, setUserId]     = useState("");
  const [users, setUsers]       = useState([]);
  const [month, setMonth]       = useState(todayYM());
  const [preset, setPreset]     = useState("whole");
  const [records, setRecords]   = useState(null);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");


  // Load staff list on mount — response: { staff: [...], attendance_today: n }
  useEffect(() => {
    apiRequest("/manager/staff")
      .then((res) => setUsers(res?.staff || res?.data || []))
      .catch(() => {});
  }, []);

  // Derived dates from month + preset
  const [startDate, endDate] = periodDates(month, preset);

  // Label for the selected period
  const periodLabel =
    preset === "first"  ? `1–15 ${month}`   :
    preset === "second" ? `16–End ${month}`  :
                          `Full Month ${month}`;

  const generate = async () => {
    if (!userId) { setError("Select a staff member."); return; }
    setLoading(true); setError("");
    try {
      const res = await apiRequest(
        `/manager/reports/dtr?user_id=${userId}&start_date=${startDate}&end_date=${endDate}`
      );
      setRecords(res?.data || []);
      setEmployee(users.find((u) => String(u.id) === String(userId)) || null);
    } catch (e) {
      setError(e.message || "Failed to load DTR.");
    } finally {
      setLoading(false);
    }
  };

  const print = () => {
    if (!records) return;
    const preparedBy = getUserData().name || "Authorized Staff";
    const employeeName = employee?.name || records[0]?.name || "Employee";
    const attendanceDays = records.filter((record) => ["present", "late", "early_leave"].includes(record.status)).length;
    exportFormalReportPDF({
      docRef: `DTR-${userId}-${startDate}-${endDate}`,
      title: "Daily Time Record",
      subtitle: "Employee Attendance Record for Payroll and DOLE Compliance",
      periodLabel: `${periodLabel} (${startDate} to ${endDate})`,
      infoFields: [
        { label: "Employee", value: employeeName },
        { label: "Employee No.", value: employee?.employee_no || records[0]?.employee_no || "Not recorded" },
        { label: "Department", value: employee?.department || records[0]?.department || "Not recorded" },
        { label: "Position / Role", value: employee?.position || employee?.role || "Not recorded" },
      ],
      summaryCards: [
        { label: "Total Records", value: stats.total },
        { label: "Present", value: stats.present },
        { label: "Late", value: stats.late },
        { label: "Absent", value: stats.absent },
        { label: "On Leave", value: stats.leave },
      ],
      table: {
        title: "Daily Attendance Register",
        columns: [
          { header: "Date", key: "date" },
          { header: "Day", key: "day_of_week" },
          { header: "Time In", key: "check_in", align: "center" },
          { header: "Time Out", key: "check_out", align: "center" },
          { header: "Hours", key: "total_hours", align: "right" },
          { header: "Overtime", key: "overtime_hours", align: "right" },
          { header: "Late Min.", key: "late_minutes", align: "right" },
          { header: "Status", value: (record) => record.status?.replace(/_/g, " ") || "—" },
        ],
        rows: records,
      },
      findings: [
        `${attendanceDays} day(s) are recorded as present, ${stats.late} as late, ${stats.absent} as absent, and ${stats.leave} as on leave for the selected period.`,
      ],
      recommendations: ["Employee and supervisor should review any missing punches or attendance exceptions and submit corrections through the approved process."],
      certification: "I certify that this Daily Time Record is a report of attendance entries maintained by the system for the employee and period shown. The employee and authorized supervisor should review and sign this record; corrections must follow the established attendance-correction process.",
      signatures: [
        { role: "Prepared by", name: preparedBy, caption: getRole() || "Authorized Manager" },
        { role: "Employee Acknowledgment", name: "", caption: employeeName },
        { role: "Certified by", name: "", caption: "Department Supervisor" },
      ],
      filename: `DTR-${employeeName.replace(/\s+/g, "-")}-${startDate}-${endDate}`,
    });
  };

  // Computed stats
  const stats = records ? {
    total:   records.length,
    present: records.filter((r) => ["present", "late", "early_leave"].includes(r.status)).length,
    late:    records.filter((r) => r.is_late).length,
    absent:  records.filter((r) => r.status === "absent").length,
    leave:   records.filter((r) => r.status === "on_leave").length,
  } : null;

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
        {/* Staff selector */}
        <div className="dtr-control-field">
          <label>Staff Member</label>
          <select
            value={userId}
            onChange={(e) => { setUserId(e.target.value); setRecords(null); }}
            className="dtr-input"
          >
            <option value="">— Select —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
            ))}
          </select>
        </div>

        {/* Month picker */}
        <div className="dtr-control-field">
          <label>Month</label>
          <input
            type="month"
            className="dtr-input"
            value={month}
            onChange={(e) => { setMonth(e.target.value); setRecords(null); }}
          />
        </div>

        {/* Period preset */}
        <div className="dtr-control-field">
          <label>Period</label>
          <div className="dtr-period-pills">
            {[
              { key: "first",  label: "1st – 15th" },
              { key: "second", label: "16th – End" },
              { key: "whole",  label: "Whole Month" },
            ].map((p) => (
              <button
                key={p.key}
                className={`dtr-period-pill${preset === p.key ? " active" : ""}`}
                onClick={() => { setPreset(p.key); setRecords(null); }}
                type="button"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <button className="dtr-btn primary" onClick={generate} disabled={loading}>
          <FontAwesomeIcon icon={faChartBar} />
          {loading ? "Generating…" : "Generate DTR"}
        </button>

        {records && (
          <button className="dtr-btn secondary" onClick={print}>
            <FontAwesomeIcon icon={faDownload} />
            Export Formal PDF
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
        <div>
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
                <span style={{ marginLeft: "0.4rem", opacity: 0.6 }}>({periodLabel})</span>
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
                      <td style={{ color: "var(--dtr-muted)" }}>{r.day_of_week || "—"}</td>
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
            {periodLabel} &nbsp;·&nbsp; {startDate} to {endDate} &nbsp;·&nbsp;
            Generated {new Date().toLocaleDateString("en-PH")} &nbsp;·&nbsp; DAILY TIME RECORD — DOLE Compliance
          </p>
        </div>
      )}
    </div>
  );
};

export default DTRReport;
