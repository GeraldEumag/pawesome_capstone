import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faPlus,
  faPencil,
  faTrash,
  faXmark,
  faRepeat,
  faStar,
  faCalendarCheck,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import "./HolidayManagement.css";

const EMPTY = { date: "", name: "", type: "regular", is_recurring: false };

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

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

  const openCreate = () => { setEditing(null); setForm(EMPTY); setMsg(""); setShowForm(true); };
  const openEdit   = (h) => {
    setEditing(h);
    setForm({ date: h.date, name: h.name, type: h.type, is_recurring: !!h.is_recurring });
    setMsg("");
    setShowForm(true);
  };
  const closeForm  = () => setShowForm(false);

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

  // Computed stats
  const totalCount   = holidays.length;
  const regularCount = holidays.filter((h) => h.type === "regular").length;
  const specialCount = holidays.filter((h) => h.type === "special_non_working").length;

  // Group by month
  const grouped = {};
  holidays.forEach((h) => {
    const month = new Date(h.date + "T00:00").getMonth();
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(h);
  });
  const monthKeys = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));

  return (
    <div className="hm-page">
      {/* Hero */}
      <div className="hm-hero">
        <div className="hm-hero-left">
          <div className="hm-eyebrow">
            <FontAwesomeIcon icon={faCalendarDays} />
            Holiday Calendar
          </div>
          <h1>Public Holidays</h1>
          <p>Manage regular and special non-working holidays for payroll and attendance computation.</p>
        </div>
        <div className="hm-hero-actions">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="hm-year-select"
          >
            {[2024, 2025, 2026, 2027, 2028].map((y) => <option key={y}>{y}</option>)}
          </select>
          <button className="hm-btn primary" onClick={openCreate}>
            <FontAwesomeIcon icon={faPlus} />
            Add Holiday
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="hm-stats">
        <div className="hm-stat-card total">
          <div className="hm-stat-icon"><FontAwesomeIcon icon={faCalendarCheck} /></div>
          <div>
            <strong>{totalCount}</strong>
            <p>Total Holidays</p>
          </div>
        </div>
        <div className="hm-stat-card regular">
          <div className="hm-stat-icon"><FontAwesomeIcon icon={faStar} /></div>
          <div>
            <strong>{regularCount}</strong>
            <p>Regular Holidays</p>
          </div>
        </div>
        <div className="hm-stat-card special">
          <div className="hm-stat-icon"><FontAwesomeIcon icon={faCalendarDays} /></div>
          <div>
            <strong>{specialCount}</strong>
            <p>Special Non-Working</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="hm-table-card">
        <table className="hm-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Holiday</th>
              <th>Type</th>
              <th>Recurring</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {holidays.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="hm-empty">
                    <FontAwesomeIcon icon={faCalendarDays} />
                    <span>No holidays for {year}</span>
                  </div>
                </td>
              </tr>
            ) : (
              monthKeys.map((monthIdx) => (
                <React.Fragment key={monthIdx}>
                  <tr className="hm-month-row">
                    <td colSpan={5}>{MONTHS[Number(monthIdx)]}</td>
                  </tr>
                  {grouped[monthIdx].map((h) => (
                    <tr key={h.id}>
                      <td>{h.date}</td>
                      <td>{h.name}</td>
                      <td>
                        <span className={`hm-type-badge ${h.type}`}>
                          {h.type === "regular" ? "Regular" : "Special Non-Working"}
                        </span>
                      </td>
                      <td>
                        {h.is_recurring
                          ? <span className="hm-recurring-badge"><FontAwesomeIcon icon={faRepeat} />Annual</span>
                          : <span style={{ color: "var(--hm-muted)", fontSize: "0.8rem" }}>One-time</span>
                        }
                      </td>
                      <td>
                        <div className="hm-action-btns">
                          <button className="hm-icon-btn edit" title="Edit" onClick={() => openEdit(h)}>
                            <FontAwesomeIcon icon={faPencil} />
                          </button>
                          <button className="hm-icon-btn delete" title="Delete" onClick={() => remove(h.id)}>
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="hm-overlay" onClick={(e) => e.target === e.currentTarget && closeForm()}>
          <div className="hm-modal">
            <div className="hm-modal-header">
              <h4>{editing ? "Edit Holiday" : "Add Holiday"}</h4>
              <button className="hm-modal-close" onClick={closeForm}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <div className="hm-modal-body">
              {msg && (
                <div className="hm-modal-error">
                  <FontAwesomeIcon icon={faXmark} />
                  {msg}
                </div>
              )}

              <div className="hm-field">
                <label>Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>

              <div className="hm-field">
                <label>Holiday Name</label>
                <input
                  type="text"
                  placeholder="e.g. New Year's Day"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="hm-field">
                <label>Type</label>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  <option value="regular">Regular Holiday</option>
                  <option value="special_non_working">Special Non-Working Holiday</option>
                </select>
              </div>

              <label className="hm-checkbox-field">
                <input
                  type="checkbox"
                  checked={form.is_recurring}
                  onChange={(e) => setForm((f) => ({ ...f, is_recurring: e.target.checked }))}
                />
                <span>Repeat annually (recurring holiday)</span>
              </label>
            </div>

            <div className="hm-modal-footer">
              <button className="hm-btn secondary" onClick={closeForm}>Cancel</button>
              <button className="hm-btn primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Add Holiday"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HolidayManagement;
