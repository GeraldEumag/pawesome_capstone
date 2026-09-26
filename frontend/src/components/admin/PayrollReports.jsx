import { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowUp,
  faBuilding,
  faChartBar,
  faChartLine,
  faDownload,
  faEye,
  faFileCsv,
  faFileExcel,
  faFilePdf,
  faMinus,
  faMoneyBillWave,
  faPlay,
  faPrint,
  faRotateRight,
  faSpinner,
  faTimes,
  faTriangleExclamation,
  faUserTie,
  faUsers,
  faWallet,
  faClock,
} from "@fortawesome/free-solid-svg-icons";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { showSuccess, showError } from "../../utils/alert.jsx";
import { exportToCSV, exportToPDF, exportToExcel } from "../../utils/reportExport";
import StandardTable from "../../components/shared/StandardTable";
import "./PayrollReports.css";

const CHART_COLORS = [
  "#ff5f93",
  "#ff8db5",
  "#ffc8dd",
  "#f472b6",
  "#fb7185",
  "#f9a8d4",
  "#ec4899",
];

const PERIODS = [
  { key: "weekly", label: "This Week" },
  { key: "monthly", label: "This Month" },
  { key: "quarterly", label: "This Quarter" },
  { key: "yearly", label: "This Year" },
];

// Payroll is semi-monthly: 1st–15th and 16th–last day of the month.
const pad2 = (n) => String(n).padStart(2, "0");
const currentMonthInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};
const periodForCutoff = (month, cutoff) => {
  if (!month) return { start: "", end: "" };
  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  return cutoff === "first"
    ? { start: `${month}-01`, end: `${month}-15` }
    : { start: `${month}-16`, end: `${month}-${pad2(lastDay)}` };
};

const safeNumber = (value) => Number(value || 0);

const PayrollReports = () => {
  const [selectedPeriod, setSelectedPeriod] = useState("monthly");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [personType, setPersonType] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [report, setReport] = useState({
    payrolls: [],
    summary: {},
    departmentBreakdown: [],
    monthlyTrend: [],
    topEarners: [],
    attendanceSummary: {},
    periodLabel: "",
  });

  const [selectedRecord, setSelectedRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [sortKey, setSortKey] = useState("net_pay");
  const [sortDirection, setSortDirection] = useState("desc");

  const [showGenerate, setShowGenerate] = useState(false);
  const [generateMonth, setGenerateMonth] = useState(currentMonthInput());
  const [generateCutoff, setGenerateCutoff] = useState(() =>
    new Date().getDate() <= 15 ? "first" : "second"
  );
  const [generating, setGenerating] = useState(false);

  // Debounce the search box before it reaches the API params
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadPayrollData = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError("");

        const params = new URLSearchParams();
        params.append("period", selectedPeriod);
        if (selectedDepartment !== "all") {
          params.append("department", selectedDepartment);
        }
        if (searchTerm) {
          params.append("search", searchTerm);
        }
        if (personType !== "all") {
          params.append("person_type", personType);
        }

        const result = await apiRequest(`/manager/reports/payroll?${params.toString()}`);
        const root = result?.data || {};

        setReport({
          payrolls: Array.isArray(root.payrolls) ? root.payrolls : [],
          summary: root.summary || {},
          departmentBreakdown: Array.isArray(root.department_breakdown)
            ? root.department_breakdown
            : [],
          monthlyTrend: Array.isArray(root.monthly_trend) ? root.monthly_trend : [],
          topEarners: Array.isArray(root.top_earners) ? root.top_earners : [],
          attendanceSummary: root.attendance_summary || {},
          periodLabel: root.period || "",
        });

        setLastUpdated(new Date().toLocaleString("en-PH"));
      } catch (err) {
        console.error("Payroll report error:", err);
        setError(err.message || "Failed to load payroll data.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedPeriod, selectedDepartment, personType, searchTerm]
  );

  useEffect(() => {
    loadPayrollData();
  }, [loadPayrollData]);

  const departments = useMemo(
    () =>
      Array.from(
        new Set(
          report.payrolls.map((row) => row.department).filter(Boolean)
        )
      ),
    [report.payrolls]
  );

  const summary = report.summary || {};

  const sortedRecords = useMemo(() => {
    const list = [...report.payrolls];
    if (!sortKey) return list;

    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDirection === "asc" ? av - bv : bv - av;
      }
      return sortDirection === "asc"
        ? String(av ?? "").localeCompare(String(bv ?? ""))
        : String(bv ?? "").localeCompare(String(av ?? ""));
    });
    return list;
  }, [report.payrolls, sortKey, sortDirection]);

  const handleSort = (key, direction) => {
    setSortKey(key);
    setSortDirection(direction);
  };

  const getGrowthIcon = (growth) => {
    if (growth > 0) return faArrowUp;
    if (growth < 0) return faArrowDown;
    return faMinus;
  };

  const getGrowthColor = (growth) => {
    if (growth > 0) return "positive";
    if (growth < 0) return "negative";
    return "neutral";
  };

  const formatDate = (value) => {
    if (!value) return "N/A";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  };

  const handleGenerate = async () => {
    const { start, end } = periodForCutoff(generateMonth, generateCutoff);

    if (!start || !end) {
      showError("Please choose a pay month and cutoff.");
      return;
    }

    setGenerating(true);
    try {
      const result = await apiRequest("/manager/payroll/generate", {
        method: "POST",
        body: JSON.stringify({ period_start: start, period_end: end }),
      });

      const count = result?.summary?.generated_count ?? result?.data?.length ?? 0;
      showSuccess(`Payroll generated from attendance — ${count} record(s).`);
      setShowGenerate(false);
      await loadPayrollData({ silent: true });
    } catch (err) {
      console.error("Generate payroll error:", err);
      showError(err.message || "Failed to generate payroll.");
    } finally {
      setGenerating(false);
    }
  };

  const exportColumns = [
    { key: "payroll_id", label: "Payroll ID" },
    { key: "employee_name", label: "Employee" },
    { key: "department", label: "Department" },
    { key: "position", label: "Position" },
    { key: "present_days", label: "Present" },
    { key: "absent_days", label: "Absent" },
    { key: "regular_hours", label: "Hours" },
    { key: "overtime_hours", label: "OT Hours" },
    { key: "base_salary", label: "Base Salary", format: "currency" },
    { key: "overtime_pay", label: "OT Pay", format: "currency" },
    { key: "total_deductions", label: "Deductions", format: "currency" },
    { key: "net_pay", label: "Net Pay", format: "currency" },
    { key: "status", label: "Status" },
    { key: "period", label: "Period" },
  ];

  const handleExport = (format) => {
    setShowExportDropdown(false);
    if (sortedRecords.length === 0) {
      showError("No payroll records to export.");
      return;
    }
    const filename = `payroll-${report.periodLabel || selectedPeriod}`;
    if (format === "csv") exportToCSV(sortedRecords, exportColumns, filename);
    else if (format === "excel") exportToExcel(sortedRecords, exportColumns, filename);
    else if (format === "pdf") exportToPDF(sortedRecords, exportColumns, "Payroll Report", filename);
    showSuccess("Payroll report exported.");
  };

  const clearFilters = () => {
    setSearchInput("");
    setSelectedDepartment("all");
    setPersonType("all");
    setSelectedPeriod("monthly");
  };

  const statusPill = (status) => (
    <span className={`pr-status-pill ${status || "draft"}`}>
      {status === "preview" ? "Preview" : status || "draft"}
    </span>
  );

  const rosterColumns = [
    {
      key: "employee_name",
      label: "Employee",
      sortable: true,
      render: (value, record) => (
        <div className="pr-employee-cell">
          <span className="pr-avatar">
            <FontAwesomeIcon icon={faUserTie} />
          </span>
          <div>
            <strong>{value}</strong>
            <small>
              {record.position || record.role || "Staff"}
              {record.employee_no ? ` · ${record.employee_no}` : ""}
              {record.person_type === "employee" ? " · Staff Record" : ""}
            </small>
          </div>
        </div>
      ),
    },
    { key: "department", label: "Department", sortable: true },
    {
      key: "present_days",
      label: "Attendance",
      sortable: true,
      render: (value, record) => (
        <div className="pr-attendance-cell">
          <strong>{value}d</strong>
          <small>
            {safeNumber(record.absent_days)} absent
            {safeNumber(record.late_days) > 0 ? ` · ${record.late_days} late` : ""}
          </small>
        </div>
      ),
    },
    {
      key: "regular_hours",
      label: "Hours",
      sortable: true,
      render: (value, record) => (
        <div className="pr-attendance-cell">
          <strong>{safeNumber(value).toFixed(1)}h</strong>
          <small>+{safeNumber(record.overtime_hours).toFixed(1)} OT</small>
        </div>
      ),
    },
    { key: "gross_pay", label: "Gross", sortable: true, format: "currency" },
    {
      key: "total_deductions",
      label: "Deductions",
      sortable: true,
      render: (value) => (
        <span className="pr-amount-negative">-{formatCurrency(value)}</span>
      ),
    },
    {
      key: "net_pay",
      label: "Net Pay",
      sortable: true,
      render: (value) => <span className="pr-net-pay">{formatCurrency(value)}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => statusPill(value),
    },
    {
      key: "actions",
      label: "",
      render: (_value, record) => (
        <button
          type="button"
          className="pr-view-btn"
          onClick={() => setSelectedRecord(record)}
        >
          <FontAwesomeIcon icon={faEye} />
          View
        </button>
      ),
    },
  ];

  const statCards = [
    {
      label: "Total Net Payroll",
      value: formatCurrency(summary.total_payroll ?? summary.total_net ?? 0),
      icon: faMoneyBillWave,
      tone: "primary",
      sub: `${summary.paid || 0} paid · ${summary.pending || 0} pending`,
      growth: summary.growth,
    },
    {
      label: "Employees Covered",
      value: summary.total_employees || 0,
      icon: faUsers,
      tone: "info",
      sub: `${summary.total_records || 0} saved · ${summary.preview || 0} preview`,
    },
    {
      label: "Average Net Pay",
      value: formatCurrency(summary.average_salary || 0),
      icon: faChartBar,
      tone: "warning",
      sub: `Gross ${formatCurrency(summary.total_gross || 0)}`,
    },
    {
      label: "Total Deductions",
      value: formatCurrency(summary.total_deductions || 0),
      icon: faWallet,
      tone: "success",
      sub: `OT paid ${formatCurrency(summary.total_overtime_pay || 0)}`,
    },
  ];

  return (
    <div className="payroll-reports">
      <section className="payroll-reports-hero">
        <div>
          <span className="payroll-eyebrow">
            <FontAwesomeIcon icon={faMoneyBillWave} />
            Payroll Intelligence
          </span>

          <h1>Payroll Reports &amp; Analytics</h1>
          <p>
            Attendance-driven payroll for {report.periodLabel || "the selected period"}.
            Preview rows are computed live from attendance — generate to save them.
          </p>

          <small>Last updated: {lastUpdated || "Not refreshed yet"}</small>
        </div>

        <div className="payroll-header-actions">
          <button
            type="button"
            className="payroll-primary-btn"
            onClick={() => setShowGenerate(true)}
          >
            <FontAwesomeIcon icon={faPlay} />
            Generate Payroll
          </button>

          <button
            type="button"
            className={`payroll-secondary-btn ${refreshing ? "refreshing" : ""}`}
            onClick={() => loadPayrollData({ silent: true })}
            disabled={refreshing}
          >
            <FontAwesomeIcon icon={refreshing ? faSpinner : faRotateRight} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

          <div className="pr-export-wrap">
            <button
              type="button"
              className="payroll-secondary-btn"
              onClick={() => setShowExportDropdown(!showExportDropdown)}
            >
              <FontAwesomeIcon icon={faDownload} />
              Export ▾
            </button>
            {showExportDropdown && (
              <>
                <div
                  className="pr-export-backdrop"
                  onClick={() => setShowExportDropdown(false)}
                />
                <div className="pr-export-menu">
                  <button type="button" onClick={() => handleExport("csv")}>
                    Export as CSV
                  </button>
                  <button type="button" onClick={() => handleExport("excel")}>
                    Export as Excel
                  </button>
                  <button type="button" onClick={() => handleExport("pdf")}>
                    Export as PDF
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="payroll-stat-grid">
        {statCards.map((item) => (
          <article className={`pr-stat-card ${item.tone}`} key={item.label}>
            <span className="pr-stat-icon">
              <FontAwesomeIcon icon={item.icon} />
            </span>
            <div>
              <strong>{item.value}</strong>
              <p>{item.label}</p>
              {item.growth !== undefined ? (
                <small className={`growth-indicator ${getGrowthColor(item.growth)}`}>
                  <FontAwesomeIcon icon={getGrowthIcon(item.growth)} />
                  {item.growth || 0}% vs previous
                </small>
              ) : (
                <small>{item.sub}</small>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="payroll-controls">
        <div className="payroll-search-box">
          <input
            type="text"
            placeholder="Search employee, department, position, status..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          {searchInput && (
            <button type="button" onClick={() => setSearchInput("")}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>

        <select
          className="payroll-select"
          value={selectedPeriod}
          onChange={(event) => setSelectedPeriod(event.target.value)}
        >
          {PERIODS.map((period) => (
            <option key={period.key} value={period.key}>
              {period.label}
            </option>
          ))}
        </select>

        <select
          className="payroll-select"
          value={selectedDepartment}
          onChange={(event) => setSelectedDepartment(event.target.value)}
        >
          <option value="all">All Departments</option>
          {departments.map((department) => (
            <option key={department} value={department}>
              {department}
            </option>
          ))}
        </select>

        <select
          className="payroll-select"
          value={personType}
          onChange={(event) => setPersonType(event.target.value)}
        >
          <option value="all">All People</option>
          <option value="account">With Account</option>
          <option value="employee">Staff Member (No Account)</option>
        </select>

        <button type="button" className="payroll-clear-btn" onClick={clearFilters}>
          <FontAwesomeIcon icon={faTimes} />
          Clear
        </button>
      </section>

      {loading && (
        <div className="payroll-loading-state">
          <FontAwesomeIcon icon={faSpinner} spin />
          <h3>Loading payroll data...</h3>
          <p>Computing payroll from attendance records.</p>
        </div>
      )}

      {error && !loading && (
        <div className="payroll-error-state">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <h3>Unable to load payroll reports</h3>
          <p>{error}</p>
          <button type="button" onClick={() => loadPayrollData()}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <section className="payroll-panel pr-roster-panel">
            <div className="payroll-panel-heading">
              <div>
                <h3>Employee Payroll Roster</h3>
                <p>
                  {sortedRecords.length} employee(s) · computed from manager
                  attendance for {report.periodLabel || "this period"}
                  {safeNumber(report.attendanceSummary?.staff_with_attendance) === 0 &&
                    " — no attendance recorded yet, showing base salary preview"}
                </p>
              </div>
              <div className="pr-attendance-badge">
                <FontAwesomeIcon icon={faClock} />
                {safeNumber(report.attendanceSummary?.staff_with_attendance)} staff clocked in ·{" "}
                {safeNumber(report.attendanceSummary?.total_hours).toFixed(0)}h logged
              </div>
            </div>

            <StandardTable
              columns={rosterColumns}
              data={sortedRecords}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={handleSort}
              emptyMessage="No employees found for the current filters."
              pageSize={10}
            />
          </section>

          <section className="payroll-dashboard-grid">
            <article className="payroll-panel">
              <div className="payroll-panel-heading">
                <div>
                  <h3>
                    <FontAwesomeIcon icon={faBuilding} /> Department Cost Overview
                  </h3>
                  <p>Net payroll distribution by department.</p>
                </div>
              </div>

              {report.departmentBreakdown.length === 0 ? (
                <div className="payroll-empty-state">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  <h3>No department data</h3>
                  <p>No department breakdown for this period.</p>
                </div>
              ) : (
                <div className="payroll-chart-box">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={report.departmentBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="department" />
                      <YAxis tickFormatter={(value) => `₱${value / 1000}k`} />
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                      <Bar dataKey="total_salary" name="Net Payroll" radius={[12, 12, 0, 0]}>
                        {report.departmentBreakdown.map((entry, index) => (
                          <Cell
                            key={entry.department}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </article>

            <article className="payroll-panel">
              <div className="payroll-panel-heading">
                <div>
                  <h3>
                    <FontAwesomeIcon icon={faChartLine} /> Payroll Trend
                  </h3>
                  <p>Saved payroll totals over recent months.</p>
                </div>
              </div>

              {report.monthlyTrend.length === 0 ? (
                <div className="payroll-empty-state">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  <h3>No trend data</h3>
                  <p>Generate payroll to start building history.</p>
                </div>
              ) : (
                <div className="payroll-chart-box">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={report.monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(value) => `₱${value / 1000}k`} />
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="payroll"
                        name="Net Payroll"
                        stroke="#ff5f93"
                        strokeWidth={4}
                        dot={{ r: 5 }}
                        activeDot={{ r: 8 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </article>
          </section>

          <section className="payroll-dashboard-grid">
            <article className="payroll-panel">
              <div className="payroll-panel-heading">
                <div>
                  <h3>Top Earners</h3>
                  <p>Highest net pay this period.</p>
                </div>
              </div>

              {report.topEarners.length === 0 ? (
                <div className="payroll-empty-state">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  <h3>No earners yet</h3>
                  <p>Payroll rows will appear once computed.</p>
                </div>
              ) : (
                <div className="earners-list">
                  {report.topEarners.map((earner, index) => (
                    <div key={earner.id || earner.user_id} className="earner-card">
                      <div className="earner-rank">#{index + 1}</div>
                      <div className="earner-info">
                        <h4>{earner.employee_name}</h4>
                        <p>{earner.position || earner.role || "Staff"}</p>
                        <span>{earner.department}</span>
                      </div>
                      <div className="earner-salary">
                        <strong>{formatCurrency(earner.net_pay)}</strong>
                        <small>{statusPill(earner.status)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="payroll-panel payroll-health-panel">
              <div className="payroll-panel-heading">
                <div>
                  <h3>Payroll Snapshot</h3>
                  <p>Status breakdown for {report.periodLabel || "this period"}.</p>
                </div>
              </div>

              <div className="payroll-health-list">
                <div>
                  <span>Saved records</span>
                  <strong>{summary.total_records || 0}</strong>
                </div>
                <div>
                  <span>Preview (from attendance)</span>
                  <strong>{summary.preview || 0}</strong>
                </div>
                <div>
                  <span>Draft / Pending / Paid</span>
                  <strong>
                    {summary.draft || 0} / {summary.pending || 0} / {summary.paid || 0}
                  </strong>
                </div>
                <div>
                  <span>Period</span>
                  <strong>{report.periodLabel || selectedPeriod}</strong>
                </div>
              </div>
            </article>
          </section>
        </>
      )}

      {selectedRecord && (
        <div className="payroll-modal-overlay" onClick={() => setSelectedRecord(null)}>
          <div className="payroll-modal" onClick={(event) => event.stopPropagation()}>
            <div className="payroll-modal-header">
              <div>
                <span className="payroll-eyebrow">
                  <FontAwesomeIcon icon={faUserTie} />
                  Payroll Record {selectedRecord.is_preview ? "· Preview" : ""}
                </span>
                <h2>{selectedRecord.employee_name}</h2>
                <small>
                  {selectedRecord.department} · {selectedRecord.position || selectedRecord.role}
                </small>
              </div>
              <button type="button" onClick={() => setSelectedRecord(null)}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="payroll-modal-body">
              <div className="pr-modal-grid">
                <div className="pr-modal-section">
                  <h4>Attendance</h4>
                  <div className="pr-modal-row">
                    <span>Present days</span>
                    <strong>{selectedRecord.present_days ?? 0}</strong>
                  </div>
                  <div className="pr-modal-row">
                    <span>Absent days</span>
                    <strong>{selectedRecord.absent_days ?? 0}</strong>
                  </div>
                  <div className="pr-modal-row">
                    <span>Regular hours</span>
                    <strong>{safeNumber(selectedRecord.regular_hours).toFixed(2)}h</strong>
                  </div>
                  <div className="pr-modal-row">
                    <span>Overtime hours</span>
                    <strong>{safeNumber(selectedRecord.overtime_hours).toFixed(2)}h</strong>
                  </div>
                </div>

                <div className="pr-modal-section">
                  <h4>Earnings</h4>
                  <div className="pr-modal-row">
                    <span>Base salary</span>
                    <strong>{formatCurrency(selectedRecord.base_salary)}</strong>
                  </div>
                  <div className="pr-modal-row">
                    <span>Overtime pay</span>
                    <strong>{formatCurrency(selectedRecord.overtime_pay)}</strong>
                  </div>
                  <div className="pr-modal-row">
                    <span>Bonus + allowances</span>
                    <strong>
                      {formatCurrency(
                        safeNumber(selectedRecord.bonus) + safeNumber(selectedRecord.allowances)
                      )}
                    </strong>
                  </div>
                  <div className="pr-modal-row pr-modal-total">
                    <span>Gross pay</span>
                    <strong>{formatCurrency(selectedRecord.gross_pay)}</strong>
                  </div>
                </div>

                <div className="pr-modal-section">
                  <h4>Deductions</h4>
                  <div className="pr-modal-row">
                    <span>SSS</span>
                    <strong>{formatCurrency(selectedRecord.sss_contribution)}</strong>
                  </div>
                  <div className="pr-modal-row">
                    <span>PhilHealth</span>
                    <strong>{formatCurrency(selectedRecord.philhealth_contribution)}</strong>
                  </div>
                  <div className="pr-modal-row">
                    <span>Pag-IBIG</span>
                    <strong>{formatCurrency(selectedRecord.pagibig_contribution)}</strong>
                  </div>
                  <div className="pr-modal-row">
                    <span>Withholding tax</span>
                    <strong>{formatCurrency(selectedRecord.tax_deduction)}</strong>
                  </div>
                  <div className="pr-modal-row">
                    <span>Late / absent</span>
                    <strong>
                      {formatCurrency(
                        safeNumber(selectedRecord.late_deductions) +
                          safeNumber(selectedRecord.absent_deductions)
                      )}
                    </strong>
                  </div>
                  <div className="pr-modal-row pr-modal-total">
                    <span>Total deductions</span>
                    <strong>
                      {formatCurrency(
                        selectedRecord.total_deductions ??
                          safeNumber(selectedRecord.sss_contribution) +
                            safeNumber(selectedRecord.philhealth_contribution) +
                            safeNumber(selectedRecord.pagibig_contribution) +
                            safeNumber(selectedRecord.tax_deduction) +
                            safeNumber(selectedRecord.late_deductions) +
                            safeNumber(selectedRecord.absent_deductions) +
                            safeNumber(selectedRecord.deductions)
                      )}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="pr-modal-netpay">
                <span>Net Pay</span>
                <strong>{formatCurrency(selectedRecord.net_pay)}</strong>
                <small>
                  {statusPill(selectedRecord.status)}
                  {selectedRecord.payment_date
                    ? ` · Paid ${formatDate(selectedRecord.payment_date)} via ${selectedRecord.payment_method || "—"}`
                    : selectedRecord.is_preview
                    ? " · Computed from attendance — not yet generated"
                    : ""}
                </small>
              </div>
            </div>
          </div>
        </div>
      )}

      {showGenerate && (
        <div className="payroll-modal-overlay" onClick={() => !generating && setShowGenerate(false)}>
          <div className="payroll-modal pr-generate-modal" onClick={(e) => e.stopPropagation()}>
            <div className="payroll-modal-header">
              <div>
                <span className="payroll-eyebrow">
                  <FontAwesomeIcon icon={faPlay} />
                  Generate Payroll
                </span>
                <h2>Create payroll from attendance</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowGenerate(false)}
                disabled={generating}
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="payroll-modal-body">
              <div className="pr-date-row">
                <label>
                  Pay month
                  <input
                    type="month"
                    value={generateMonth}
                    onChange={(e) => setGenerateMonth(e.target.value)}
                  />
                </label>
                <label>
                  Cutoff
                  <select
                    value={generateCutoff}
                    onChange={(e) => setGenerateCutoff(e.target.value)}
                  >
                    <option value="first">1st – 15th</option>
                    <option value="second">16th – end of month</option>
                  </select>
                </label>
              </div>

              <p className="pr-generate-note">
                Payroll is computed from attendance records (days worked,
                late/absent, hours, overtime) with statutory deductions applied.
                Pay periods are semi-monthly: 1st–15th or 16th–end of month.
                Existing records for the same period are skipped.
              </p>

              <div className="management-actions pr-generate-actions">
                <button
                  type="button"
                  className="payroll-primary-btn"
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  <FontAwesomeIcon icon={generating ? faSpinner : faPlay} spin={generating} />
                  {generating ? "Generating..." : "Generate"}
                </button>
                <button
                  type="button"
                  className="payroll-secondary-btn"
                  onClick={() => setShowGenerate(false)}
                  disabled={generating}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollReports;
