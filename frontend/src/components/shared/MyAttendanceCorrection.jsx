import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import { attendanceApi } from "../../api/attendance";
import "./MyAttendanceCorrection.css";

const STATUS_COLORS = {
  pending:  { color: "#b45309", bg: "rgba(245,158,11,.1)" },
  approved: { color: "#059669", bg: "rgba(5,150,105,.1)" },
  rejected: { color: "#ef4444", bg: "rgba(239,68,68,.1)" },
};

const MyAttendanceCorrection = () => {
  const [attendance, setAttendance] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [today, setToday] = useState("");
  const [punchLoading, setPunchLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected]   = useState(null);
  const [form, setForm]           = useState({ requested_check_in: "", requested_check_out: "", reason: "" });
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState({ text: "", type: "" });

  const load = async () => {
    setLoadError("");
    try {
      const [attendanceResponse, correctionResponse] = await Promise.all([
        apiRequest("/my-attendance"),
        apiRequest("/my-attendance/corrections"),
      ]);
      setToday(attendanceResponse?.today || "");
      setAttendance(Array.isArray(attendanceResponse?.data) ? attendanceResponse.data : []);
      const correctionData = correctionResponse?.data;
      setCorrections(
        Array.isArray(correctionData?.data)
          ? correctionData.data
          : Array.isArray(correctionData)
            ? correctionData
            : []
      );
    } catch (error) {
      setLoadError(error.message || "Unable to load your attendance records.");
      setAttendance([]);
      setCorrections([]);
    }
  };

  useEffect(() => { load(); }, []);

  const todayAttendance = attendance.find(
    (record) => String(record.date || "").slice(0, 10) === today
  );

  const recordPunch = async () => {
    if (punchLoading) return;
    setPunchLoading(true);
    setMsg({ text: "", type: "" });
    try {
      if (todayAttendance?.check_in && !todayAttendance?.check_out) {
        await attendanceApi.checkOut();
        setMsg({ text: "Time-out recorded.", type: "success" });
      } else if (!todayAttendance?.check_in) {
        await attendanceApi.checkIn();
        setMsg({ text: "Time-in recorded.", type: "success" });
      }
      await load();
    } catch (error) {
      setMsg({ text: error.message || "Unable to record attendance.", type: "error" });
    } finally {
      setPunchLoading(false);
    }
  };

  const fileCorrection = async () => {
    if (!selected) { setMsg({ text: "Select an attendance record to correct.", type: "error" }); return; }
    if (!form.reason.trim()) { setMsg({ text: "Please provide a reason.", type: "error" }); return; }
    setSaving(true); setMsg({ text: "", type: "" });
    try {
      await apiRequest("/my-attendance/corrections", {
        method: "POST",
        body: JSON.stringify({ attendance_id: selected.id, date: selected.date, ...form }),
      });
      setSelected(null); setForm({ requested_check_in: "", requested_check_out: "", reason: "" });
      setMsg({ text: "Correction request submitted.", type: "success" });
      load();
    } catch (e) {
      setMsg({ text: e.message || "Failed to submit.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mac-container">
      <h2 className="mac-title">My Attendance</h2>
      {msg.text && <p className={`mac-msg ${msg.type}`}>{msg.text}</p>}
      {loadError && <p className="mac-msg error">{loadError}</p>}

      <section className="mac-section">
        <h4 className="mac-section-title">Today's Time Record</h4>
        <div className="mac-form glass-card">
          <p><strong>{today || "Loading business date..."}</strong></p>
          <p className="mac-current">
            In: {todayAttendance?.check_in ? String(todayAttendance.check_in).slice(0, 5) : "—"}
            {" · "}
            Out: {todayAttendance?.check_out ? String(todayAttendance.check_out).slice(0, 5) : "—"}
            {" · "}
            {todayAttendance?.status || "Not punched"}
          </p>
          <button
            className="mac-btn primary"
            onClick={recordPunch}
            disabled={punchLoading || Boolean(todayAttendance?.check_in && todayAttendance?.check_out)}
          >
            {punchLoading
              ? "Recording..."
              : todayAttendance?.check_in
                ? todayAttendance?.check_out ? "Day Complete" : "Time Out"
                : "Time In"}
          </button>
        </div>
      </section>

      <div className="mac-columns">
        {/* Attendance list */}
        <section className="mac-section">
          <h4 className="mac-section-title">Recent Records</h4>
          <div className="mac-list">
            {attendance.length === 0 && <p className="mac-empty">No attendance records found.</p>}
            {attendance.map((a) => (
              <div
                key={a.id}
                className={`mac-item glass-card${selected?.id === a.id ? " selected" : ""}`}
                onClick={() => setSelected(selected?.id === a.id ? null : a)}
              >
                <div className="mac-item-top">
                  <strong>{a.date}</strong>
                  <span className={`mac-status ${a.status}`}>{a.status}</span>
                </div>
                <div className="mac-times">
                  <span>In: {a.check_in ? a.check_in.slice(0, 5) : "—"}</span>
                  <span>Out: {a.check_out ? a.check_out.slice(0, 5) : "—"}</span>
                  {a.total_hours > 0 && <span>{a.total_hours}h</span>}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Correction form */}
        {selected && (
          <section className="mac-section">
            <h4 className="mac-section-title">File Correction — {selected.date}</h4>
            <div className="mac-form glass-card">
              <p className="mac-current">Current: {selected.check_in || "—"} → {selected.check_out || "—"}</p>
              <label>Correct Check-In Time<input type="time" value={form.requested_check_in} onChange={(e) => setForm((f) => ({ ...f, requested_check_in: e.target.value }))} /></label>
              <label>Correct Check-Out Time<input type="time" value={form.requested_check_out} onChange={(e) => setForm((f) => ({ ...f, requested_check_out: e.target.value }))} /></label>
              <label>Reason (required)
                <textarea rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Explain the correction needed…" />
              </label>
              <button className="mac-btn primary" onClick={fileCorrection} disabled={saving}>{saving ? "Submitting…" : "Submit Correction"}</button>
            </div>
          </section>
        )}
      </div>

      {/* My submitted corrections */}
      <section className="mac-section" style={{ marginTop: 24 }}>
        <h4 className="mac-section-title">My Correction Requests</h4>
        {corrections.length === 0 ? (
          <p className="mac-empty">No correction requests yet.</p>
        ) : (
          <div className="mac-list">
            {corrections.map((c) => {
              const sc = STATUS_COLORS[c.status] || STATUS_COLORS.pending;
              return (
                <div key={c.id} className="mac-item glass-card">
                  <div className="mac-item-top">
                    <strong>{c.date}</strong>
                    <span className="mac-status-pill" style={{ background: sc.bg, color: sc.color }}>{c.status}</span>
                  </div>
                  <div className="mac-times">
                    {c.requested_check_in && <span>Req In: {c.requested_check_in}</span>}
                    {c.requested_check_out && <span>Req Out: {c.requested_check_out}</span>}
                  </div>
                  {c.reason && <p className="mac-reason">"{c.reason}"</p>}
                  {c.remarks && <p className="mac-remarks"><strong>Reviewer:</strong> {c.remarks}</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default MyAttendanceCorrection;
