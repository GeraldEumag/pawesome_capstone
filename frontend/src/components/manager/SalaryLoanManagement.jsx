import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHandHoldingDollar,
  faPlus,
  faXmark,
  faCircleCheck,
  faCoins,
  faScaleBalanced,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import DatePickerInput from "../shared/DatePickerInput";
import { formatDateOnly, parseDateOnly } from "../../utils/date";
import RowActionPopover from "../shared/RowActionPopover";
import "./SalaryLoanManagement.css";

const fmt = (v) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(v || 0);

const EMPTY = {
  user_id: "", employee_id: "",
  loan_type: "salary_loan",
  principal: "", installment_amount: "",
  start_period: "", end_period: "",
  notes: "",
};

const STATUSES = [
  { key: "active",    label: "Active" },
  { key: "paid",      label: "Paid" },
  { key: "cancelled", label: "Cancelled" },
];

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
      .then((res) => setUsers(res?.staff || res?.data || []))
      .catch(() => {});
  };

  useEffect(() => { load(); loadUsers(); }, [filter]);

  const openCreate = () => { setForm(EMPTY); setMsg(""); setShowForm(true); };
  const closeForm  = () => setShowForm(false);

  const save = async () => {
    if (!form.principal || !form.installment_amount || !form.start_period) {
      setMsg("Principal, installment, and start period are required."); return;
    }
    if (!form.user_id && !form.employee_id) { setMsg("Select a staff member."); return; }
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

  // Computed stats (over active loans for context)
  const activeLoans     = loans.filter((l) => l.status === "active");
  const totalPrincipal  = loans.reduce((s, l) => s + parseFloat(l.principal || 0), 0);
  const totalBalance    = loans.reduce((s, l) => s + parseFloat(l.balance || 0), 0);

  const repayPct = (loan) => {
    const p = parseFloat(loan.principal);
    const b = parseFloat(loan.balance);
    if (!p) return 0;
    return Math.min(100, Math.max(0, ((p - b) / p) * 100));
  };

  const empName = (l) =>
    l.user?.name || (l.employee ? `${l.employee.first_name} ${l.employee.last_name}` : "—");

  return (
    <div className="slm-page">
      {/* Hero */}
      <div className="slm-hero">
        <div className="slm-hero-left">
          <div className="slm-eyebrow">
            <FontAwesomeIcon icon={faHandHoldingDollar} />
            Loan Tracker
          </div>
          <h1>Salary Loans &amp; Cash Advances</h1>
          <p>Track, manage, and auto-deduct employee salary loans and cash advances each payroll cutoff.</p>
        </div>
        <div className="slm-hero-actions">
          <button className="slm-btn primary" onClick={openCreate}>
            <FontAwesomeIcon icon={faPlus} />
            New Loan
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="slm-stats">
        <div className="slm-stat-card active-loans">
          <div className="slm-stat-icon"><FontAwesomeIcon icon={faCircleCheck} /></div>
          <div>
            <strong>{activeLoans.length}</strong>
            <p>Active Loans</p>
          </div>
        </div>
        <div className="slm-stat-card principal">
          <div className="slm-stat-icon"><FontAwesomeIcon icon={faCoins} /></div>
          <div>
            <strong style={{ fontSize: "1.1rem" }}>{fmt(totalPrincipal)}</strong>
            <p>Total Principal</p>
          </div>
        </div>
        <div className="slm-stat-card balance">
          <div className="slm-stat-icon"><FontAwesomeIcon icon={faScaleBalanced} /></div>
          <div>
            <strong style={{ fontSize: "1.1rem" }}>{fmt(totalBalance)}</strong>
            <p>Outstanding Balance</p>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="slm-filter-bar">
        <span className="slm-filter-label">Status:</span>
        {STATUSES.map((s) => (
          <button
            key={s.key}
            className={`slm-filter-pill${filter === s.key ? " active" : ""}`}
            onClick={() => setFilter(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="slm-table-card">
        <table className="slm-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Type</th>
              <th>Principal</th>
              <th>Balance</th>
              <th>Repayment</th>
              <th>Installment</th>
              <th>Start</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loans.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="slm-empty">No loans found for this status.</div>
                </td>
              </tr>
            ) : (
              loans.map((l) => {
                const pct = repayPct(l);
                const paid = parseFloat(l.balance) <= 0;
                return (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 750 }}>{empName(l)}</td>
                    <td>
                      <span className={`slm-type-badge ${l.loan_type}`}>
                        {l.loan_type === "salary_loan" ? "Salary Loan" : "Cash Advance"}
                      </span>
                    </td>
                    <td>{fmt(l.principal)}</td>
                    <td className={paid ? "slm-balance-paid" : ""}>{fmt(l.balance)}</td>
                    <td>
                      <div className="slm-progress-wrap">
                        <div className="slm-progress-track">
                          <div className="slm-progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="slm-progress-label">{pct.toFixed(0)}% paid</span>
                      </div>
                    </td>
                    <td>{fmt(l.installment_amount)}/cutoff</td>
                    <td>{l.start_period}</td>
                    <td>
                      <span className={`slm-status-badge ${l.status}`}>{l.status}</span>
                    </td>
                    <td>
                      <RowActionPopover rowLabel={l.user?.name || l.employee?.name || `Loan ${l.id}`}>
                        {l.status === "active" && (
                          <button className="slm-icon-btn" title="Cancel loan" onClick={() => cancel(l.id)}>
                            <FontAwesomeIcon icon={faXmark} />
                          </button>
                        )}
                      </RowActionPopover>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="slm-overlay" onClick={(e) => e.target === e.currentTarget && closeForm()}>
          <div className="slm-modal">
            <div className="slm-modal-header">
              <h4>New Loan / Cash Advance</h4>
              <button className="slm-modal-close" onClick={closeForm}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <div className="slm-modal-body">
              {msg && (
                <div className="slm-modal-error">
                  <FontAwesomeIcon icon={faXmark} />
                  {msg}
                </div>
              )}

              <div className="slm-field">
                <label>Staff Member</label>
                <select
                  value={form.user_id}
                  onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value, employee_id: "" }))}
                >
                  <option value="">— Select account user —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
              </div>

              <div className="slm-field">
                <label>Loan Type</label>
                <select value={form.loan_type} onChange={(e) => setForm((f) => ({ ...f, loan_type: e.target.value }))}>
                  <option value="salary_loan">Salary Loan</option>
                  <option value="cash_advance">Cash Advance</option>
                </select>
              </div>

              <div className="slm-form-row">
                <div className="slm-field">
                  <label>Principal Amount (₱)</label>
                  <input
                    type="number" min={1}
                    placeholder="0.00"
                    value={form.principal}
                    onChange={(e) => setForm((f) => ({ ...f, principal: e.target.value }))}
                  />
                </div>
                <div className="slm-field">
                  <label>Installment / Cutoff (₱)</label>
                  <input
                    type="number" min={1}
                    placeholder="0.00"
                    value={form.installment_amount}
                    onChange={(e) => setForm((f) => ({ ...f, installment_amount: e.target.value }))}
                  />
                </div>
              </div>

              <div className="slm-form-row">
                <div className="slm-field">
                  <label>Start Period</label>
                  <DatePickerInput
                    selected={parseDateOnly(form.start_period)}
                    onChange={(date) => setForm((f) => ({ ...f, start_period: formatDateOnly(date) }))}
                  />
                </div>
                <div className="slm-field">
                  <label>End Period (optional)</label>
                  <DatePickerInput
                    selected={parseDateOnly(form.end_period)}
                    onChange={(date) => setForm((f) => ({ ...f, end_period: formatDateOnly(date) }))}
                  />
                </div>
              </div>

              <div className="slm-field">
                <label>Notes (optional)</label>
                <textarea
                  rows={2}
                  placeholder="Purpose or remarks…"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>

            <div className="slm-modal-footer">
              <button className="slm-btn secondary" onClick={closeForm}>Cancel</button>
              <button className="slm-btn primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Create Loan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalaryLoanManagement;
