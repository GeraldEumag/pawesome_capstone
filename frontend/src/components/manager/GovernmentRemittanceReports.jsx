import React, { useState } from "react";
import { apiRequest } from "../../api/client";
import "./GovernmentRemittanceReports.css";

const TABS = [
  { key: "sss",        label: "SSS R3",         headers: ["Employee", "SSS No.", "Base Salary", "Employee Share", "Employer Share", "Total"] },
  { key: "philhealth", label: "PhilHealth RF-1", headers: ["Employee", "PhilHealth No.", "Base Salary", "Employee Share", "Employer Share", "Total"] },
  { key: "pagibig",    label: "Pag-IBIG RF-1",  headers: ["Employee", "Pag-IBIG No.", "Base Salary", "Employee Share", "Employer Share", "Total"] },
];

const fmt = (v) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(v || 0);

const GovernmentRemittanceReports = () => {
  const [tab, setTab]       = useState("sss");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await apiRequest(`/manager/reports/remittance?period=${period}&type=${tab}`);
      setData(res);
    } catch (e) {
      setError(e.message || "Failed to load report.");
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!data?.data?.length) return;
    const headers = TABS.find((t) => t.key === tab)?.headers.join(",");
    const rows = data.data.map((r) =>
      [r.employee_name, r.sss_no || r.philhealth_no || r.pagibig_no || "", r.base_salary, r.employee_share, r.employer_share, r.total].join(",")
    ).join("\n");
    const blob = new Blob([headers + "\n" + rows], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `${tab}-remittance-${period}.csv`; a.click();
  };

  const currentTab = TABS.find((t) => t.key === tab);

  return (
    <div className="grr-container">
      <h3 className="grr-title">Government Remittance Reports</h3>

      <div className="grr-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`grr-tab${tab === t.key ? " active" : ""}`} onClick={() => { setTab(t.key); setData(null); }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grr-controls">
        <label>Period (Month)
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="grr-input" />
        </label>
        <button className="grr-btn primary" onClick={load} disabled={loading}>{loading ? "Loading…" : "Generate Report"}</button>
        {data && <button className="grr-btn" onClick={exportCSV}>Export CSV</button>}
      </div>

      {error && <p className="grr-error">{error}</p>}

      {data && (
        <>
          <div className="grr-summary">
            <span>Employee Total: <strong>{fmt(data.totals?.employee_total)}</strong></span>
            <span>Employer Total: <strong>{fmt(data.totals?.employer_total)}</strong></span>
            <span>Grand Total: <strong>{fmt(data.totals?.grand_total)}</strong></span>
          </div>
          <table className="grr-table">
            <thead><tr>{currentTab.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {data.data.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "#94a3b8" }}>No records for {period}</td></tr>}
              {data.data.map((r, i) => (
                <tr key={i}>
                  <td>{r.employee_name}</td>
                  <td>{r.sss_no || r.philhealth_no || r.pagibig_no || "—"}</td>
                  <td>{fmt(r.base_salary)}</td>
                  <td>{fmt(r.employee_share)}</td>
                  <td>{fmt(r.employer_share)}</td>
                  <td><strong>{fmt(r.total)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {!data && !loading && (
        <div className="grr-empty">Select a period and click "Generate Report" to view contributions.</div>
      )}
    </div>
  );
};

export default GovernmentRemittanceReports;
