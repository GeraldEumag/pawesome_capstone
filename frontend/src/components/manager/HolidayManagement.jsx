import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import "./HolidayManagement.css";

const EMPTY = { date: "", name: "", type: "regular", is_recurring: false };

const HolidayManagement = () => {
  const [holidays, setHolidays] = useState([]);
  const [year, setYear]         = useState(new Date().getFullYear());
  const [form, setForm]         = useState(EMPTY);
  const [editing, setEditing]   = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState("");

  const load = () => {
    apiRequest(`/manager/holidays?year=${year}`)
      .then((res) => setHolidays(res?.data || []))
      .catch(() => {});
  };

  useEffect(() => { load(); }, [year]);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setShowForm(true); setMsg(""); };
  const openEdit   = (h) => { setEditing(h); setForm({ date: h.date, name: h.name, type: h.type, is_recurring: !!h.is_recurring }); setShowForm(true); setMsg(""); };

  const save = async () => {
    if (!form.date || !form.name) { setMsg("Date and name are required."); return; }
    setSaving(true); setMsg("");
    try {
      if (editing) {
        await apiRequest(`/manager/holidays/${editing.id}`, { method: "PUT", body: JSON.stringify(form) });
      } else {
        await apiRequest("/manager/holidays", { method: "POST", body: JSON.stringify(form) });
      }
      setShowForm(false); load();
    } catch (e) { setMsg(e.message || "Failed to save."); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this holiday?")) return;
    await apiRequest(`/manager/holidays/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  };

  return (
    <div className="hm-container">
      <div className="hm-header">
        <h3 className="hm-title">Holiday Calendar</h3>
        <div className="hm-actions">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="hm-year">
            {[2024, 2025, 2026, 2027, 2028].map((y) => <option key={y}>{y}</option>)}
          </select>
          <button className="hm-btn primary" onClick={openCreate}>+ Add Holiday</button>
        </div>
      </div>

      <table className="hm-table">
        <thead><tr><th>Date</th><th>Name</th><th>Type</th><th>Recurring</th><th>Actions</th></tr></thead>
        <tbody>
          {holidays.length === 0 && (
            <tr><td colSpan={5} style={{ textAlign: "center", color: "#94a3b8" }}>No holidays for {year}</td></tr>
          )}
          {holidays.map((h) => (
            <tr key={h.id}>
              <td>{h.date}</td>
              <td>{h.name}</td>
              <td><span className={`hm-type ${h.type}`}>{h.type === "regular" ? "Regular" : "Special Non-Working"}</span></td>
              <td>{h.is_recurring ? "Yes" : "No"}</td>
              <td>
                <button className="hm-btn sm" onClick={() => openEdit(h)}>Edit</button>
                <button className="hm-btn sm danger" onClick={() => remove(h.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && (
        <div className="hm-overlay">
          <div className="hm-modal glass-card">
            <h4>{editing ? "Edit Holiday" : "Add Holiday"}</h4>
            {msg && <p className="hm-msg">{msg}</p>}
            <label>Date<input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></label>
            <label>Name<input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
            <label>Type
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="regular">Regular Holiday</option>
                <option value="special_non_working">Special Non-Working Holiday</option>
              </select>
            </label>
            <label className="hm-check">
              <input type="checkbox" checked={form.is_recurring} onChange={(e) => setForm((f) => ({ ...f, is_recurring: e.target.checked }))} />
              Recurring annually
            </label>
            <div className="hm-modal-footer">
              <button className="hm-btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="hm-btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HolidayManagement;
