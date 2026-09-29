import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileInvoiceDollar,
  faChartBar,
  faDownload,
  faUsers,
  faBuilding,
  faSackDollar,
  faCircleExclamation,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import "./GovernmentRemittanceReports.css";

const AGENCIES = [
  {
    key: "sss",
    label: "SSS R3",
    cls: "sss",
    dotColor: "#2563eb",
    subtitle: "Social Security System",
    headers: ["Employee", "SSS No.", "Base Salary", "Employee Share", "Employer Share", "Total"],
  },
  {
    key: "philhealth",
    label: "PhilHealth RF-1",
    cls: "philhealth",
    dotColor: "#059669",
    subtitle: "Philippine Health Insurance",
    headers: ["Employee", "PhilHealth No.", "Base Salary", "Employee Share", "Employer Share", "Total"],
  },
  {
    key: "pagibig",
    label: "Pag-IBIG RF-1",
    cls: "pagibig",
    dotColor: "#dc2626",
    subtitle: "Home Development Mutual Fund",
    headers: ["Employee", "Pag-IBIG No.", "Base Salary", "Employee Share", "Employer Share", "Total"],
  },
];

const fmt = (v) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(v || 0);

const GovernmentRemittanceReports = () => {
  const [tab, setTab]         = useState("sss");
  const [period, setPeriod]   = useState(new Date().toISOString().slice(0, 7));
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

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
    const agency  = AGENCIES.find((a) => a.key === tab);
    const headers = agency.headers.join(",");
    const rows    = data.data
      .map((r) =>
        [
          r.employee_name,
          r.sss_no || r.philhealth_no || r.pagibig_no || "",
          r.base_salary,
          r.employee_share,
          r.employer_share,
          r.total,
        ].join(",")
      )
      .join("\n");
    const blob = new Blob([headers + "\n" + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${tab}-remittance-${period}.csv`;
    a.click();
  };

  const currentAgency = AGENCIES.find((a) => a.key === tab);
  const numId = (r) => r.sss_no || r.philhealth_no || r.pagibig_no || "—";

  const switchTab = (key) => { setTab(key); setData(null); setError(""); };

  return (
    <div className="grr-page">
      {/* Hero */}
      <div className="grr-hero">
        <div className="grr-hero-left">
          <div className="grr-eyebrow">
            <FontAwesomeIcon icon={faFileInvoiceDollar} />
            Compliance Reports
          </div>
          <h1>Government Remittance</h1>
          <p className="grr-hero-sub">
            Generate SSS, PhilHealth, and Pag-IBIG contribution reports for monthly remittance compliance.
          </p>
          <div className="grr-agency-dots">
            <span className="grr-dot sss">SSS R3</span>
            <span className="grr-dot philhealth">PhilHealth RF-1</span>
            <span className="grr-dot pagibig">Pag-IBIG RF-1</span>
          </div>
        </div>
      </div>

      {/* Agency Tab Bar */}
      <div className="grr-tab-bar">
        {AGENCIES.map((a) => (
          <button
            key={a.key}
            className={`grr-tab-btn ${a.cls}${tab === a.key ? " active" : ""}`}
            onClick={() => switchTab(a.key)}
          >
            <span className="grr-tab-accent" style={{ background: a.dotColor }} />
            <span>{a.label}</span>
            <span style={{ fontSize: "0.72rem", color: "inherit", opacity: 0.7 }}>{a.subtitle}</span>
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="grr-controls-card">
        <div className="grr-control-field">
          <label>Period (Month)</label>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="grr-input"
          />
        </div>
        <button className="grr-btn primary" onClick={load} disabled={loading}>
          <FontAwesomeIcon icon={faChartBar} />
          {loading ? "Generating…" : "Generate Report"}
        </button>
        {data && data.data?.length > 0 && (
          <button className="grr-btn secondary" onClick={exportCSV}>
            <FontAwesomeIcon icon={faDownload} />
            Export CSV
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="grr-alert">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          {error}
        </div>
      )}

      {/* Totals */}
      {data && (
        <>
          <div className="grr-totals">
            <div className="grr-total-card emp">
              <div className="grr-total-icon"><FontAwesomeIcon icon={faUsers} /></div>
              <div>
                <strong>{fmt(data.totals?.employee_total)}</strong>
                <p>Employee Share Total</p>
              </div>
            </div>
            <div className="grr-total-card empl">
              <div className="grr-total-icon"><FontAwesomeIcon icon={faBuilding} /></div>
              <div>
                <strong>{fmt(data.totals?.employer_total)}</strong>
                <p>Employer Share Total</p>
              </div>
            </div>
            <div className="grr-total-card grand">
              <div className="grr-total-icon"><FontAwesomeIcon icon={faSackDollar} /></div>
              <div>
                <strong>{fmt(data.totals?.grand_total)}</strong>
                <p>Grand Total Remittance</p>
              </div>
            </div>
          </div>

          <div className="grr-table-card">
            <table className="grr-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>{currentAgency.headers[1]}</th>
                  <th className="num">Base Salary</th>
                  <th className="num">Employee Share</th>
                  <th className="num">Employer Share</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.data.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", color: "var(--grr-muted)", padding: "3rem" }}>
                      No records for {period}
                    </td>
                  </tr>
                ) : (
                  data.data.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 750 }}>{r.employee_name}</td>
                      <td style={{ color: "var(--grr-muted)", fontFamily: "monospace" }}>{numId(r)}</td>
                      <td className="num">{fmt(r.base_salary)}</td>
                      <td className="num">{fmt(r.employee_share)}</td>
                      <td className="num">{fmt(r.employer_share)}</td>
                      <td className="num total-col">{fmt(r.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Empty prompt */}
      {!data && !loading && (
        <div className="grr-empty-state">
          <div className="grr-empty-icon">
            <FontAwesomeIcon icon={faCircleExclamation} />
          </div>
          <h3>No Report Generated</h3>
          <p>Select a period and click "Generate Report" to view contribution data.</p>
        </div>
      )}
    </div>
  );
};

export default GovernmentRemittanceReports;
