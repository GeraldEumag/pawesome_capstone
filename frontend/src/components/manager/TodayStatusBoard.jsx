import React, { useEffect, useRef, useState } from "react";
import { apiRequest } from "../../api/client";
import "./TodayStatusBoard.css";

const STATUS_CONFIG = {
  checked_in:  { label: "Present",      color: "#059669", bg: "rgba(5,150,105,0.1)" },
  late:        { label: "Late",         color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  checked_out: { label: "Checked Out",  color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
  on_leave:    { label: "On Leave",     color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
  absent:      { label: "Absent",       color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  not_yet:     { label: "Not Yet In",   color: "#94a3b8", bg: "rgba(148,163,184,0.1)" },
};

const TodayStatusBoard = () => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("all");
  const intervalRef = useRef(null);

  const load = () => {
    apiRequest("/manager/attendance/today-status")
      .then((res) => { setData(res); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 60000);
    return () => clearInterval(intervalRef.current);
  }, []);

  if (loading) return <div className="tsb-loading">Loading today's status…</div>;
  if (!data) return <div className="tsb-loading">No data available.</div>;

  const staff = (data.data || []).filter((s) => filter === "all" || s.status === filter);
  const summary = data.summary || {};

  return (
    <div className="tsb-container">
      <div className="tsb-header">
        <div>
          <h3 className="tsb-title">Today's Attendance — {data.date}</h3>
          <small className="tsb-subtitle">Shift: {data.shift_start} – {data.shift_end} · Auto-refreshes every 60s</small>
        </div>
        <button type="button" className="tsb-refresh" onClick={load}>↻ Refresh</button>
      </div>

      <div className="tsb-summary">
        {Object.entries(STATUS_CONFIG).map(([k, cfg]) => (
          <button
            key={k}
            type="button"
            className={`tsb-chip${filter === k ? " active" : ""}`}
            style={{ borderColor: cfg.color, color: filter === k ? "#fff" : cfg.color, background: filter === k ? cfg.color : cfg.bg }}
            onClick={() => setFilter(filter === k ? "all" : k)}
          >
            {cfg.label}: {summary[k] || 0}
          </button>
        ))}
        <button
          type="button"
          className={`tsb-chip${filter === "all" ? " active" : ""}`}
          onClick={() => setFilter("all")}
          style={{ borderColor: "#7c3aed", color: filter === "all" ? "#fff" : "#7c3aed", background: filter === "all" ? "#7c3aed" : "rgba(124,58,237,0.1)" }}
        >
          All: {summary.total || 0}
        </button>
      </div>

      <div className="tsb-grid">
        {staff.map((s) => {
          const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.not_yet;
          return (
            <div key={s.id} className="tsb-card" style={{ borderLeft: `4px solid ${cfg.color}` }}>
              <div className="tsb-card-name">{s.name}</div>
              <div className="tsb-card-sub">{s.role} · {s.department || "—"}</div>
              <div className="tsb-card-times">
                {s.check_in && <span>In: {s.check_in}</span>}
                {s.check_out && <span>Out: {s.check_out}</span>}
                {s.total_hours > 0 && <span>{s.total_hours}h</span>}
              </div>
              <span className="tsb-status-pill" style={{ background: cfg.bg, color: cfg.color }}>
                {cfg.label}
              </span>
            </div>
          );
        })}
        {staff.length === 0 && (
          <div className="tsb-empty">No staff with status "{filter}"</div>
        )}
      </div>
    </div>
  );
};

export default TodayStatusBoard;
