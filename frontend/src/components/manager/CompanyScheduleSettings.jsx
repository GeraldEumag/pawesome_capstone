import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import "./CompanyScheduleSettings.css";

const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const CompanyScheduleSettings = () => {
  const [settings, setSettings] = useState(null);
  const [form, setForm]         = useState({});
  const [saving, setSaving]     = useState(false);
  const [message, setMessage]   = useState("");

  useEffect(() => {
    apiRequest("/manager/company-schedule").then((res) => {
      const d = res?.data || res;
      setSettings(d);
      setForm({
        shift_start:              d.shift_start || "08:00",
        shift_end:                d.shift_end || "17:00",
        break_minutes:            d.break_minutes || 60,
        work_days:                d.work_days || [1, 2, 3, 4, 5, 6],
        grace_period_minutes:     d.grace_period_minutes || 15,
        daily_rate_divisor:       d.daily_rate_divisor || 26,
        overtime_threshold_hours: d.overtime_threshold_hours || 8,
      });
    }).catch(() => {});
  }, []);

  const toggleDay = (v) => {
    setForm((f) => ({
      ...f,
      work_days: f.work_days.includes(v)
        ? f.work_days.filter((d) => d !== v)
        : [...f.work_days, v].sort((a, b) => a - b),
    }));
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await apiRequest("/manager/company-schedule", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setMessage("Settings saved successfully.");
    } catch (e) {
      setMessage("Error: " + (e.message || "Failed to save."));
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="css-loading">Loading settings…</div>;

  return (
    <div className="css-container glass-card">
      <h3 className="css-title">Company Schedule Settings</h3>
      <p className="css-subtitle">
        These settings apply to all staff. Individual scheduling has been removed — one fixed schedule for everyone.
      </p>

      <div className="css-grid">
        <label className="css-field">
          <span>Shift Start</span>
          <input type="time" value={form.shift_start} onChange={(e) => setForm((f) => ({ ...f, shift_start: e.target.value }))} />
        </label>
        <label className="css-field">
          <span>Shift End</span>
          <input type="time" value={form.shift_end} onChange={(e) => setForm((f) => ({ ...f, shift_end: e.target.value }))} />
        </label>
        <label className="css-field">
          <span>Break Duration (minutes)</span>
          <input type="number" min={0} max={120} value={form.break_minutes} onChange={(e) => setForm((f) => ({ ...f, break_minutes: Number(e.target.value) }))} />
        </label>
        <label className="css-field">
          <span>Grace Period (minutes)</span>
          <input type="number" min={0} max={60} value={form.grace_period_minutes} onChange={(e) => setForm((f) => ({ ...f, grace_period_minutes: Number(e.target.value) }))} />
        </label>
        <label className="css-field">
          <span>Daily Rate Divisor</span>
          <input type="number" min={1} max={31} value={form.daily_rate_divisor} onChange={(e) => setForm((f) => ({ ...f, daily_rate_divisor: Number(e.target.value) }))} />
          <small>Working days per month used in daily rate calculation</small>
        </label>
        <label className="css-field">
          <span>Overtime Threshold (hours)</span>
          <input type="number" min={4} max={12} value={form.overtime_threshold_hours} onChange={(e) => setForm((f) => ({ ...f, overtime_threshold_hours: Number(e.target.value) }))} />
        </label>
      </div>

      <div className="css-days-group">
        <span className="css-days-label">Working Days</span>
        <div className="css-days-row">
          {DAYS.map((d) => (
            <button
              key={d.value}
              type="button"
              className={`css-day-btn${form.work_days.includes(d.value) ? " active" : ""}`}
              onClick={() => toggleDay(d.value)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {message && <p className={`css-msg${message.startsWith("Error") ? " error" : ""}`}>{message}</p>}

      <button type="button" className="css-save-btn" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save Settings"}
      </button>
    </div>
  );
};

export default CompanyScheduleSettings;
