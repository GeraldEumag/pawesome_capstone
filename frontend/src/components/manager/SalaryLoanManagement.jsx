import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import "./SalaryLoanManagement.css";

const fmt = (v) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(v || 0);

const EMPTY = { user_id: "", employee_id: "", loan_type: "salary_loan", principal: "", installment_amount: "", start_period: "", end_period: "", notes: "" };

const SalaryLoanManagement = () => {
  const [loans, setLoans]       = useState([]);
  const [users, setUsers]       = useState([]);
  const [form, setForm]         = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState("");
  const [filter, setFilter]     = useState("active");

  const load = () => {
    apiRequest(`/manager/salary-loans?status=${filter}`)
      .then((res) => setLoans(res?.data?.data || res?.data || []))
      .catch(() => {});
  };

  const loadUsers = () => {
    apiRequest("/manager/staff")
      .then((res) => setUsers(res?.data || []))
      .catch(() => {});
  };

  useEffect(() => { load(); loadUsers(); }, [filter]);

  const save = async () => {
    if (!form.principal || !form.installment_amount || !form.start_period) {
      setMsg("Principal, installment, and start period are required."); return;
    }
    if (!form.user_id && !form.employee_id) {
      setMsg("Select a staff member."); return;
    }
    setSaving(true); setMsg("");
    try {
      await apiRequest("/manager/salary-loans", { method: "POST", body: JSON.stringify(form) });
      setShowForm(false); setForm(EMPTY); load();
    } catch (e) { setMsg(e.message || "Failed to save."); }
    finally { setSaving(false); }
  };

  const cancel = async (id) => {
    if (!window.confirm("Cancel this loan?")) return;
    await apiRequest(`/manager/salary-loans/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  };

  return (
    <div className="slm-container">
      <div className="slm-header">
        <h3 className="slm-title">Salary Loans & Cash Advances</h3>
        <div className="slm-actions">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="slm-select">
            <option value="active">Active</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button className="slm-btn primary" onClick={() => { setForm(EMPTY); setMsg(""); setShowForm(true); }}>+ New Loan</button>
        </div>
      </div>

      <table className="slm-table">
        <thead><tr><th>Employee</th><th>Type</th><th>Principal</th><th>Balance</th><th>Installment</th><th>Start</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {loans.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", color: "#94a3b8" }}>No loans found</td></tr>}
          {loans.map((l) => (
            <tr key={l.id}>
              <td>{l.user?.name || l.employee ? `${l.employee?.first_name} ${l.employee?.last_name}` : "—"}</td>
              <td><span className={`slm-type ${l.loan_type}`}>{l.loan_type === "salary_loan" ? "Salary Loan" : "Cash Advance"}</span></td>
              <td>{fmt(l.principal)}</td>
              <td style={{ color: l.balance <= 0 ? "#059669" : undefined }}>{fmt(l.balance)}</td>
              <td>{fmt(l.installment_amount)}/cutoff</td>
              <td>{l.start_period}</td>
              <td><span className={`slm-status ${l.status}`}>{l.status}</span></td>
              <td>{l.status === "active" && <button className="slm-btn sm danger" onClick={() => cancel(l.id)}>Cancel</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && (
        <div className="slm-overlay">
          <div className="slm-modal glass-card">
            <h4>New Loan / Cash Advance</h4>
            {msg && <p className="slm-msg">{msg}</p>}
            <label>Staff Member
              <select value={form.user_id} onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value, employee_id: "" }))}>
                <option value="">— Select account user —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
            </label>
            <label>Type
              <select value={form.loan_type} onChange={(e) => setForm((f) => ({ ...f, loan_type: e.target.value }))}>
                <option value="salary_loan">Salary Loan</option>
                <option value="cash_advance">Cash Advance</option>
              </select>
            </label>
            <label>Principal Amount<input type="number" min={1} value={form.principal} onChange={(e) => setForm((f) => ({ ...f, principal: e.target.value }))} /></label>
            <label>Installment per Cutoff<input type="number" min={1} value={form.installment_amount} onChange={(e) => setForm((f) => ({ ...f, installment_amount: e.target.value }))} /></label>
            <label>Start Period<input type="date" value={form.start_period} onChange={(e) => setForm((f) => ({ ...f, start_period: e.target.value }))} /></label>
            <label>End Period (optional)<input type="date" value={form.end_period} onChange={(e) => setForm((f) => ({ ...f, end_period: e.target.value }))} /></label>
            <label>Notes<textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></label>
            <div className="slm-modal-footer">
              <button className="slm-btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="slm-btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Create Loan"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalaryLoanManagement;
