import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import DatePickerInput from "./DatePickerInput";
import { formatDateOnly, parseDateOnly } from "../../utils/date";
import "./MyLeave.css";

const LEAVE_TYPES = [
  { value: "sick_leave",              label: "Sick Leave" },
  { value: "vacation_leave",          label: "Vacation Leave" },
  { value: "emergency_leave",         label: "Emergency Leave" },
  { value: "maternity_leave",         label: "Maternity Leave" },
  { value: "paternity_leave",         label: "Paternity Leave" },
  { value: "bereavement_leave",       label: "Bereavement Leave" },
  { value: "service_incentive_leave", label: "Service Incentive Leave" },
  { value: "solo_parent_leave",       label: "Solo Parent Leave" },
  { value: "magna_carta_leave",       label: "Magna Carta Leave" },
  { value: "special_leave_benefit",   label: "Special Leave Benefit" },
  { value: "unpaid_leave",            label: "Unpaid Leave" },
];

const STATUS_COLORS = {
  pending:  { color: "#b45309", bg: "rgba(245,158,11,.1)" },
  approved: { color: "#059669", bg: "rgba(5,150,105,.1)" },
  rejected: { color: "#ef4444", bg: "rgba(239,68,68,.1)" },
  cancelled:{ color: "#94a3b8", bg: "rgba(148,163,184,.1)" },
};

const EMPTY_FORM = { leave_type: "sick_leave", start_date: "", end_date: "", reason: "" };

const MyLeave = () => {
  const [leaves, setLeaves]       = useState([]);
  const [balances, setBalances]   = useState([]);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState({ text: "", type: "" });

  const load = () => {
    apiRequest("/my-leaves").then((r) => setLeaves(r?.data || r || [])).catch(() => {});
    apiRequest("/my-leaves/balance").then((r) => setBalances(r?.data || r || [])).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.start_date || !form.end_date) {
      setMsg({ text: "Please fill in start and end dates.", type: "error" }); return;
    }
    setSaving(true); setMsg({ text: "", type: "" });
    try {
      await apiRequest("/my-leaves", { method: "POST", body: JSON.stringify(form) });
      setShowForm(false); setForm(EMPTY_FORM);
      setMsg({ text: "Leave request submitted successfully.", type: "success" });
      load();
    } catch (e) {
      setMsg({ text: e.message || "Failed to submit leave.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (id) => {
    if (!window.confirm("Cancel this leave request?")) return;
    await apiRequest(`/my-leaves/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  };

  const typeMeta = (v) => LEAVE_TYPES.find((t) => t.value === v) || { label: v };

  return (
    <div className="ml-container">
      <div className="ml-header">
        <h2 className="ml-title">My Leave</h2>
        <button className="ml-btn primary" onClick={() => { setShowForm(!showForm); setMsg({ text: "", type: "" }); }}>
          {showForm ? "Cancel" : "+ File Leave"}
        </button>
      </div>

      {/* Leave balance chips */}
      {balances.length > 0 && (
        <div className="ml-balances">
          {balances.map((b) => (
            <div key={b.leave_type} className="ml-balance-chip">
              <span className="ml-balance-type">{typeMeta(b.leave_type).label}</span>
              <span className="ml-balance-count">{b.remaining_days} / {b.total_days}</span>
              <small>days left</small>
            </div>
          ))}
        </div>
      )}

      {/* New leave form */}
      {showForm && (
        <div className="ml-form glass-card">
          <h4>New Leave Request</h4>
          {msg.text && <p className={`ml-msg ${msg.type}`}>{msg.text}</p>}
          <div className="ml-form-grid">
            <label>Leave Type
              <select value={form.leave_type} onChange={(e) => setForm((f) => ({ ...f, leave_type: e.target.value }))}>
                {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label>Start Date<DatePickerInput selected={parseDateOnly(form.start_date)} onChange={(date) => setForm((f) => ({ ...f, start_date: formatDateOnly(date) }))} /></label>
            <label>End Date<DatePickerInput selected={parseDateOnly(form.end_date)} onChange={(date) => setForm((f) => ({ ...f, end_date: formatDateOnly(date) }))} /></label>
          </div>
          <label className="ml-full">Reason / Notes
            <textarea rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Optional reason for leave…" />
          </label>
          <button className="ml-btn primary" onClick={submit} disabled={saving}>{saving ? "Submitting…" : "Submit Request"}</button>
        </div>
      )}

      {msg.text && !showForm && <p className={`ml-msg standalone ${msg.type}`}>{msg.text}</p>}

      {/* Leave history */}
      <div className="ml-history">
        <h4 className="ml-section-title">Leave Requests</h4>
        {leaves.length === 0 ? (
          <p className="ml-empty">No leave requests yet.</p>
        ) : (
          <div className="ml-list">
            {leaves.map((l) => {
              const sc = STATUS_COLORS[l.status] || STATUS_COLORS.pending;
              return (
                <div key={l.id} className="ml-item glass-card">
                  <div className="ml-item-top">
                    <span className="ml-item-type">{typeMeta(l.leave_type || l.type).label}</span>
                    <span className="ml-status-pill" style={{ background: sc.bg, color: sc.color }}>{l.status}</span>
                  </div>
                  <div className="ml-item-dates">
                    {l.start_date} → {l.end_date}
                    {l.days_counted && <span className="ml-days">({l.days_counted} day{l.days_counted !== 1 ? "s" : ""})</span>}
                  </div>
                  {l.reason && <p className="ml-item-reason">"{l.reason}"</p>}
                  {l.manager_remarks && (
                    <p className="ml-item-remarks"><strong>Manager:</strong> {l.manager_remarks}</p>
                  )}
                  {l.status === "pending" && (
                    <button className="ml-cancel-btn" onClick={() => cancel(l.id)}>Cancel Request</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyLeave;
