import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import "./ThirteenthMonthPanel.css";

const fmt = (v) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(v || 0);

const ThirteenthMonthPanel = () => {
  const [year, setYear]         = useState(new Date().getFullYear());
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [accruing, setAccruing] = useState(false);
  const [msg, setMsg]           = useState("");

  const load = () => {
    setLoading(true);
    apiRequest(`/manager/payroll/thirteenth-month?year=${year}`)
      .then((res) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [year]);

  const accrue = async () => {
    setAccruing(true); setMsg("");
    try {
      await apiRequest("/manager/payroll/thirteenth-month/accrue", { method: "POST", body: JSON.stringify({ year }) });
      setMsg("Accrual updated."); load();
    } catch (e) { setMsg("Error: " + (e.message || "Failed.")); }
    finally { setAccruing(false); }
  };

  const pay = async (id) => {
    if (!window.confirm("Mark this 13th month as paid?")) return;
    await apiRequest(`/manager/payroll/thirteenth-month/${id}/pay`, { method: "POST" }).catch(() => {});
    load();
  };

  const rows = data?.data || [];

  return (
    <div className="tmp-container">
      <div className="tmp-header">
        <h3 className="tmp-title">13th Month Pay</h3>
        <div className="tmp-actions">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="tmp-select">
            {[2024, 2025, 2026, 2027].map((y) => <option key={y}>{y}</option>)}
          </select>
          <button className="tmp-btn primary" onClick={accrue} disabled={accruing}>{accruing ? "Accruing…" : "Trigger Accrual"}</button>
        </div>
      </div>

      {msg && <p className="tmp-msg">{msg}</p>}

      <div className="tmp-summary">
        <span>Total Accrued: <strong>{fmt(data?.totals?.total_accrued)}</strong></span>
        <span>Total Paid: <strong>{fmt(data?.totals?.total_paid)}</strong></span>
        <span>Remaining: <strong>{fmt((data?.totals?.total_accrued || 0) - (data?.totals?.total_paid || 0))}</strong></span>
      </div>

      {loading ? <div className="tmp-loading">Loading…</div> : (
        <table className="tmp-table">
          <thead><tr><th>Employee</th><th>Total Accrued</th><th>Paid</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "#94a3b8" }}>No accruals for {year}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.user?.name || (r.employee ? `${r.employee.first_name} ${r.employee.last_name}` : "—")}</td>
                <td>{fmt(r.total_accrued)}</td>
                <td>{fmt(r.paid_amount)}</td>
                <td><span className={`tmp-status ${r.status}`}>{r.status}</span></td>
                <td>{r.status !== "paid" && <button className="tmp-btn sm primary" onClick={() => pay(r.id)}>Pay Now</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ThirteenthMonthPanel;
