import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import { showConfirm } from "../../utils/alert.jsx";
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

const EMPTY_FORM = { type: "sick_leave", start_date: "", end_date: "", reason: "" };

const listFromResponse = (response) => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.data)) return response.data.data;
  return [];
};

const MyLeave = () => {
  const [leaves, setLeaves]       = useState([]);
  const [balances, setBalances]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [msg, setMsg]             = useState({ text: "", type: "" });

  const load = async () => {
    setLoading(true);
    setLoadError("");
    const [leaveResult, balanceResult] = await Promise.allSettled([
      apiRequest("/my-leaves"),
      apiRequest("/my-leaves/balance"),
    ]);

    if (leaveResult.status === "fulfilled") {
      setLeaves(listFromResponse(leaveResult.value));
    } else {
      setLeaves([]);
      setLoadError(leaveResult.reason?.message || "Failed to load leave requests.");
    }

    if (balanceResult.status === "fulfilled") {
      setBalances(listFromResponse(balanceResult.value));
    } else {
      setBalances([]);
      setLoadError((current) => current || balanceResult.reason?.message || "Failed to load leave balances.");
    }

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.start_date || !form.end_date) {
      setMsg({ text: "Please fill in start and end dates.", type: "error" }); return;
    }
    if (!form.reason.trim()) {
      setMsg({ text: "Please provide a reason for your leave request.", type: "error" }); return;
    }
    setSaving(true); setMsg({ text: "", type: "" });
    try {
      await apiRequest("/my-leaves", {
        method: "POST",
        body: JSON.stringify({ ...form, reason: form.reason.trim() }),
      });
      setShowForm(false); setForm(EMPTY_FORM);
      setMsg({ text: "Leave request submitted successfully.", type: "success" });
      await load();
    } catch (e) {
      setMsg({ text: e.message || "Failed to submit leave.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (id) => {
    if (!(await showConfirm("Cancel this leave request?", "Cancel Leave", "Yes, Cancel", "Keep", "warning", true))) return;
    setCancellingId(id);
    setMsg({ text: "", type: "" });
    try {
      await apiRequest(`/my-leaves/${id}`, { method: "DELETE" });
      setMsg({ text: "Leave request cancelled.", type: "success" });
      await load();
    } catch (e) {
      setMsg({ text: e.message || "Failed to cancel leave request.", type: "error" });
    } finally {
      setCancellingId(null);
    }
  };

  const typeMeta = (v) => LEAVE_TYPES.find((t) => t.value === v) || { label: v };

  return (
    <div className="ml-container">
      <div className="ml-header">
        <h2 className="ml-title">My Leave</h2>
        <button className="ml-btn primary" onClick={() => { setShowForm(!showForm); setMsg({ text: "", type: "" }); }} disabled={saving || cancellingId !== null}>
          {showForm ? "Cancel" : "+ File Leave"}
        </button>
      </div>

      {loadError && (
        <p className="ml-msg error" role="alert">
          {loadError} <button type="button" onClick={load} disabled={loading}>Retry</button>
        </p>
      )}

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
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} disabled={saving}>
                {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label>Start Date<DatePickerInput selected={parseDateOnly(form.start_date)} onChange={(date) => setForm((f) => ({ ...f, start_date: formatDateOnly(date) }))} disabled={saving} required /></label>
            <label>End Date<DatePickerInput selected={parseDateOnly(form.end_date)} onChange={(date) => setForm((f) => ({ ...f, end_date: formatDateOnly(date) }))} disabled={saving} required /></label>
          </div>
          <label className="ml-full">Reason *
            <textarea rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Enter reason for leave…" disabled={saving} required />
          </label>
          <button className="ml-btn primary" onClick={submit} disabled={saving}>{saving ? "Submitting…" : "Submit Request"}</button>
        </div>
      )}

      {msg.text && !showForm && <p className={`ml-msg standalone ${msg.type}`}>{msg.text}</p>}

      {/* Leave history */}
      <div className="ml-history">
        <h4 className="ml-section-title">Leave Requests</h4>
        {loading ? (
          <p className="ml-empty">Loading leave requests…</p>
        ) : leaves.length === 0 && loadError ? (
          <p className="ml-empty">Unable to load leave requests.</p>
        ) : leaves.length === 0 ? (
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
                    <button className="ml-cancel-btn" onClick={() => cancel(l.id)} disabled={cancellingId === l.id || saving || loading}>
                      {cancellingId === l.id ? "Cancelling…" : "Cancel Request"}
                    </button>
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
