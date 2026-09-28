import React, { useRef, useState } from "react";
import { apiRequest } from "../../api/client";
import "./DTRReport.css";

const DTRReport = () => {
  const [userId, setUserId]         = useState("");
  const [users, setUsers]           = useState([]);
  const [startDate, setStartDate]   = useState(new Date().toISOString().slice(0, 8) + "01");
  const [endDate, setEndDate]       = useState(new Date().toISOString().slice(0, 10));
  const [records, setRecords]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const printRef                    = useRef();

  const loadUsers = () => {
    if (users.length) return;
    apiRequest("/manager/staff").then((res) => setUsers(res?.data || [])).catch(() => {});
  };

  const generate = async () => {
    if (!userId) { setError("Select a staff member."); return; }
    setLoading(true); setError("");
    try {
      const res = await apiRequest(`/manager/reports/dtr?user_id=${userId}&start_date=${startDate}&end_date=${endDate}`);
      setRecords(res?.data || []);
    } catch (e) { setError(e.message || "Failed to load DTR."); }
    finally { setLoading(false); }
  };

  const print = () => {
    const win = window.open("", "_blank");
    win.document.write("<html><head><title>DTR</title><style>body{font-family:Arial,sans-serif;font-size:12px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ccc;padding:6px 8px} th{background:#f3f4f6}</style></head><body>");
    win.document.write(printRef.current.innerHTML);
    win.document.write("</body></html>");
    win.document.close();
    win.print();
  };

  return (
    <div className="dtr-container">
      <h3 className="dtr-title">Daily Time Record (DTR) — DOLE Compliance</h3>

      <div className="dtr-controls">
        <label>Staff Member
          <select value={userId} onFocus={loadUsers} onChange={(e) => setUserId(e.target.value)} className="dtr-input">
            <option value="">— Select —</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
          </select>
        </label>
        <label>From<input type="date" className="dtr-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>To<input type="date" className="dtr-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        <button className="dtr-btn primary" onClick={generate} disabled={loading}>{loading ? "Loading…" : "Generate DTR"}</button>
        {records && <button className="dtr-btn" onClick={print}>🖨 Print</button>}
      </div>

      {error && <p className="dtr-error">{error}</p>}

      {records && (
        <div ref={printRef}>
          <div className="dtr-header-info">
            <strong>DAILY TIME RECORD</strong> · {startDate} to {endDate}
          </div>
          <table className="dtr-table">
            <thead>
              <tr>
                <th>Date</th><th>Day</th>
                <th>Time In</th><th>Time Out</th>
                <th>Total Hours</th><th>OT Hours</th>
                <th>Late (min)</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", color: "#94a3b8" }}>No records found</td></tr>}
              {records.map((r, i) => (
                <tr key={i} style={{ background: r.status === "absent" ? "rgba(239,68,68,.05)" : undefined }}>
                  <td>{r.date}</td>
                  <td>{r.day_of_week}</td>
                  <td style={{ color: r.is_late ? "#f59e0b" : undefined }}>{r.check_in || "—"}</td>
                  <td>{r.check_out || "—"}</td>
                  <td>{r.total_hours || "—"}</td>
                  <td>{r.overtime_hours > 0 ? r.overtime_hours : "—"}</td>
                  <td style={{ color: r.late_minutes > 0 ? "#ef4444" : undefined }}>{r.late_minutes > 0 ? r.late_minutes : "—"}</td>
                  <td><span className={`dtr-status ${r.status}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="dtr-footer">Total Records: {records.length} · Generated on {new Date().toLocaleDateString("en-PH")}</p>
        </div>
      )}
    </div>
  );
};

export default DTRReport;
