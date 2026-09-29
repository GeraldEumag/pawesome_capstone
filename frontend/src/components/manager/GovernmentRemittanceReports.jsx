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
import { exportFormalReportPDF } from "../../utils/formalReportPdf";
import { getRole, getUserData } from "../../utils/auth";
import { exportToCSV } from "../../utils/reportExport";
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
    const agency = AGENCIES.find((a) => a.key === tab);
    const identifierKey = tab === "sss" ? "sss_no" : tab === "philhealth" ? "philhealth_no" : "pagibig_no";
    const columns = [
      { key: "employee_name", label: agency.headers[0] },
      { key: identifierKey, label: agency.headers[1] },
      { key: "base_salary", label: agency.headers[2], format: "currency" },
      { key: "employee_share", label: agency.headers[3], format: "currency" },
      { key: "employer_share", label: agency.headers[4], format: "currency" },
      { key: "total", label: agency.headers[5], format: "currency" },
    ];
    exportToCSV(data.data, columns, `${tab}-remittance-${period}`, {
      title: `${agency.label} Government Remittance Report`,
      periodLabel: period,
    });
  };

  const exportPDF = () => {
    if (!data) return;
    const agency = AGENCIES.find((a) => a.key === tab);
    const preparedBy = getUserData().name || "Authorized Staff";
    const totalEmployees = data.data?.length || 0;
    exportFormalReportPDF({
      docRef: `${tab.toUpperCase()}-${period}`,
      title: `${agency.label} Government Remittance Report`,
      subtitle: `${agency.subtitle} — statutory contribution register`,
      periodLabel: period,
      infoFields: [
        { label: "Agency", value: agency.subtitle },
        { label: "Employees Listed", value: totalEmployees },
        { label: "Prepared By", value: preparedBy },
      ],
      summaryCards: [
        { label: "Employees", value: totalEmployees },
        { label: "Employee Share", value: fmt(data.totals?.employee_total) },
        { label: "Employer Share", value: fmt(data.totals?.employer_total) },
        { label: "Grand Total", value: fmt(data.totals?.grand_total) },
      ],
      table: {
        title: `${agency.label} Contribution Details`,
        columns: [
          { header: "Employee", key: "employee_name" },
          { header: agency.headers[1], value: (row) => row.sss_no || row.philhealth_no || row.pagibig_no || "—" },
          { header: "Base Salary", value: (row) => fmt(row.base_salary), align: "right" },
          { header: "Employee Share", value: (row) => fmt(row.employee_share), align: "right" },
          { header: "Employer Share", value: (row) => fmt(row.employer_share), align: "right" },
          { header: "Total Remittance", value: (row) => fmt(row.total), align: "right" },
        ],
        rows: data.data || [],
        foot: ["TOTAL", "", "", fmt(data.totals?.employee_total), fmt(data.totals?.employer_total), fmt(data.totals?.grand_total)],
      },
      findings: [
        `${totalEmployees} employee record(s) are included for ${period}. Employee contributions total ${fmt(data.totals?.employee_total)} and employer contributions total ${fmt(data.totals?.employer_total)}.`,
      ],
      recommendations: ["Reconcile this contribution register against payroll records and the applicable agency remittance schedule before payment or filing."],
      certification: "This schedule is prepared from payroll contribution data available for the selected reporting period. Verify employee identifiers and contribution amounts against current agency requirements before filing.",
      signatures: [
        { role: "Prepared by", name: preparedBy, caption: getRole() || "Payroll Personnel" },
        { role: "Reviewed by", name: "", caption: "Payroll Reviewer" },
        { role: "Approved by", name: "", caption: "Authorized Manager" },
      ],
      filename: `${tab}-remittance-${period}`,
    });
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
        {data && (
          <>
            {data.data?.length > 0 && (
              <button className="grr-btn secondary" onClick={exportCSV}>
                <FontAwesomeIcon icon={faDownload} />
                Export CSV
              </button>
            )}
            <button className="grr-btn secondary" onClick={exportPDF}>
              <FontAwesomeIcon icon={faDownload} />
              Export Formal PDF
            </button>
          </>
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
