import { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowUp,
  faBuilding,
  faCalendarAlt,
  faChartBar,
  faChartLine,
  faDownload,
  faEye,
  faFileCsv,
  faFileExcel,
  faFilePdf,
  faFilter,
  faPrint,
  faMagnifyingGlass,
  faMinus,
  faMoneyBillWave,
  faRotateRight,
  faSpinner,
  faTimes,
  faTriangleExclamation,
  faUserTie,
  faUsers,
  faWallet,
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
import { normalizeList } from "../../utils/normalizeList";
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

const REPORT_TYPES = [
  { key: "summary", label: "Summary", icon: faMoneyBillWave },
  { key: "department", label: "Department", icon: faBuilding },
  { key: "trend", label: "Trends", icon: faChartLine },
  { key: "topEarners", label: "Top Earners", icon: faUserTie },
  { key: "records", label: "Records", icon: faWallet },
];

const PERIODS = ["weekly", "monthly", "quarterly", "yearly"];

const FALLBACK_DEPARTMENTS = [
  "Veterinary",
  "Customer Service",
  "Management",
  "Grooming",
  "Reception",
  "Inventory",
  "Cashier",
];

const safeNumber = (value) => Number(value || 0);

const safeArray = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.records)) return value.records;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.payrolls)) return value.payrolls;
  if (Array.isArray(value?.employees)) return value.employees;
  if (Array.isArray(value?.salaries)) return value.salaries;
  return [];
};

const PayrollReports = () => {
  const [selectedPeriod, setSelectedPeriod] = useState("monthly");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [reportType, setReportType] = useState("summary");
  const [searchTerm, setSearchTerm] = useState("");

  const [payrollData, setPayrollData] = useState({
    summary: {},
    departmentBreakdown: [],
    monthlyTrend: [],
    topEarners: [],
    payrolls: [],
  });

  const [selectedRecord, setSelectedRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const normalizePayload = (result) => {
    const root =
      result?.data?.data && !Array.isArray(result.data.data)
        ? result.data.data
        : result?.data && !Array.isArray(result.data)
        ? result.data
        : result || {};

    const payrolls = safeArray(
      root.payrolls ||
        root.records ||
        root.salaries ||
        root.employees ||
        root.data ||
        result?.payrolls ||
        result?.records ||
        result
    );

    const departmentBreakdown = normalizeList(
      root.departmentBreakdown ||
        root.department_breakdown ||
        root.departments ||
        root.departmentSummary,
      ["data", "records", "items"]
    );

    const monthlyTrend = normalizeList(
      root.monthlyTrend || root.monthly_trend || root.trend || root.payrollTrend,
      ["data", "records", "items"]
    );

    const topEarners = normalizeList(
      root.topEarners || root.top_earners || root.highestPaid || root.top_employees,
      ["data", "records", "items"]
    );

    const summary = root.summary || result?.summary || {};

    return {
      summary,
      departmentBreakdown,
      monthlyTrend,
      topEarners,
      payrolls,
    };
  };

  const normalizePayrollRecord = (record, index) => {
    const employee = record.user || record.employee || {};

    return {
      id: record.id || record.payroll_id || index + 1,
      employeeName:
        record.employee_name ||
        employee.name ||
        record.name ||
        record.staff_name ||
        "Unknown Employee",
      employeeId:
        record.employee_id ||
        record.user_id ||
        employee.id ||
        `EMP${String(index + 1).padStart(3, "0")}`,
      department: record.department || employee.department || "Unassigned",
      position: record.position || employee.position || record.role || "Staff",
      baseSalary: safeNumber(record.base_salary || record.salary || record.basic_pay),
      bonus: safeNumber(record.bonus || record.total_bonus || record.allowance),
      deductions:
        safeNumber(record.deductions) ||
        safeNumber(record.total_deductions) ||
        safeNumber(record.sss_contribution) +
          safeNumber(record.philhealth_contribution) +
          safeNumber(record.pagibig_contribution) +
          safeNumber(record.tax_deduction),
      netPay: safeNumber(record.net_pay || record.netPay || record.total_net_pay),
      grossPay: safeNumber(record.gross_pay || record.grossPay || record.total_gross_pay),
      status: record.status || record.payment_status || "pending",
      payPeriod:
        record.pay_period_label ||
        record.pay_period ||
        record.period ||
        selectedPeriod,
      paymentDate: record.payment_date || record.paid_at || record.updated_at || "",
      createdAt: record.created_at || record.date || "",
      raw: record,
    };
  };

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

        if (searchTerm.trim()) {
          params.append("search", searchTerm.trim());
        }

        let result;

        try {
          result = await apiRequest(`/manager/reports/payroll?${params.toString()}`);
        } catch (reportError) {
          const records = await apiRequest(`/manager/payroll?${params.toString()}`);
          result = {
            payrolls: normalizeList(records, ["data", "records", "items", "payrolls"]),
          };
        }
        const normalized = normalizePayload(result);

        setPayrollData({
          summary: normalized.summary || {},
          departmentBreakdown: normalized.departmentBreakdown || [],
          monthlyTrend: normalized.monthlyTrend || [],
          topEarners: normalized.topEarners || [],
          payrolls: normalized.payrolls.map(normalizePayrollRecord),
        });

        setLastUpdated(new Date().toLocaleString("en-PH"));
      } catch (err) {
        console.error("Payroll report error:", err);
        setError(err.message || "Failed to load payroll data.");
        setPayrollData({
          summary: {},
          departmentBreakdown: [],
          monthlyTrend: [],
          topEarners: [],
          payrolls: [],
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedPeriod, selectedDepartment, searchTerm]
  );

  useEffect(() => {
    loadPayrollData();
  }, [loadPayrollData]);

  const payrollRecords = useMemo(
    () => normalizeList(payrollData.payrolls, ["data", "records", "items"]),
    [payrollData.payrolls]
  );

  const departmentBreakdown = useMemo(() => {
    const list = normalizeList(payrollData.departmentBreakdown, [
      "data",
      "records",
      "items",
    ]);

    if (list.length > 0) {
      return list.map((item) => ({
        department: item.department || item.name || "Unassigned",
        employees: safeNumber(item.employees || item.employee_count || item.count),
        totalSalary: safeNumber(item.totalSalary || item.total_salary || item.totalPayroll),
        average: safeNumber(item.average || item.averageSalary || item.average_salary),
        percentage: safeNumber(item.percentage),
        trend: safeNumber(item.trend || item.growth),
      }));
    }

    const grouped = payrollRecords.reduce((acc, record) => {
      const department = record.department || "Unassigned";

      if (!acc[department]) {
        acc[department] = {
          department,
          employees: 0,
          totalSalary: 0,
          average: 0,
          percentage: 0,
          trend: 0,
        };
      }

      acc[department].employees += 1;
      acc[department].totalSalary += safeNumber(record.netPay || record.baseSalary);

      return acc;
    }, {});

    const totalSalary = Object.values(grouped).reduce(
      (sum, item) => sum + item.totalSalary,
      0
    );

    return Object.values(grouped).map((item) => ({
      ...item,
      average: item.employees ? item.totalSalary / item.employees : 0,
      percentage: totalSalary ? Math.round((item.totalSalary / totalSalary) * 100) : 0,
    }));
  }, [payrollData.departmentBreakdown, payrollRecords]);

  const monthlyTrendData = useMemo(() => {
    const list = normalizeList(payrollData.monthlyTrend, ["data", "records", "items"]);

    return list.map((item) => ({
      month: item.month || item.month_name || item.label || item.period || "N/A",
      payroll: safeNumber(item.payroll || item.totalPayroll || item.total_payroll || item.amount),
      employees: safeNumber(item.employees || item.employee_count || item.totalEmployees),
    }));
  }, [payrollData.monthlyTrend]);

  const topEarnersData = useMemo(() => {
    const list = normalizeList(payrollData.topEarners, ["data", "records", "items"]);

    if (list.length > 0) {
      return list.map((item) => ({
        id: item.id || item.employee_id || item.name,
        name: item.name || item.employee_name || item.user?.name || "Unknown Employee",
        position: item.position || item.role || "Staff",
        department: item.department || "Unassigned",
        salary: safeNumber(item.salary || item.net_pay || item.base_salary),
      }));
    }

    return [...payrollRecords]
      .sort((a, b) => safeNumber(b.netPay) - safeNumber(a.netPay))
      .slice(0, 8)
      .map((record) => ({
        id: record.id,
        name: record.employeeName,
        position: record.position,
        department: record.department,
        salary: safeNumber(record.netPay || record.baseSalary),
      }));
  }, [payrollData.topEarners, payrollRecords]);

  const departments = useMemo(() => {
    const fromBreakdown = departmentBreakdown.map((item) => item.department).filter(Boolean);
    const fromPayroll = payrollRecords.map((item) => item.department).filter(Boolean);
    return Array.from(new Set([...FALLBACK_DEPARTMENTS, ...fromBreakdown, ...fromPayroll]));
  }, [departmentBreakdown, payrollRecords]);

  const filteredPayrollRecords = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return payrollRecords.filter((record) => {
      const matchesDepartment =
        selectedDepartment === "all" || record.department === selectedDepartment;

      const searchableText = [
        record.employeeName,
        record.employeeId,
        record.department,
        record.position,
        record.status,
        record.payPeriod,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !keyword || searchableText.includes(keyword);

      return matchesDepartment && matchesSearch;
    });
  }, [payrollRecords, selectedDepartment, searchTerm]);

  const filteredDepartmentData = useMemo(() => {
    if (selectedDepartment === "all") return departmentBreakdown;
    return departmentBreakdown.filter((dept) => dept.department === selectedDepartment);
  }, [selectedDepartment, departmentBreakdown]);

  const derivedSummary = useMemo(() => {
    const backendSummary = payrollData.summary || {};
    const totalPayroll =
      safeNumber(backendSummary.totalPayroll || backendSummary.total_payroll) ||
      filteredPayrollRecords.reduce((sum, record) => sum + safeNumber(record.netPay), 0);

    const totalEmployees =
      safeNumber(backendSummary.totalEmployees || backendSummary.total_employees) ||
      filteredPayrollRecords.length;

    const totalBonuses =
      safeNumber(backendSummary.totalBonuses || backendSummary.total_bonuses) ||
      filteredPayrollRecords.reduce((sum, record) => sum + safeNumber(record.bonus), 0);

    const totalDeductions =
      safeNumber(backendSummary.totalDeductions || backendSummary.total_deductions) ||
      filteredPayrollRecords.reduce(
        (sum, record) => sum + safeNumber(record.deductions),
        0
      );

    const averageSalary =
      safeNumber(backendSummary.averageSalary || backendSummary.average_salary) ||
      (totalEmployees ? totalPayroll / totalEmployees : 0);

    return {
      totalPayroll,
      totalEmployees,
      averageSalary,
      totalBonuses,
      totalDeductions,
      growth: safeNumber(backendSummary.growth || backendSummary.payroll_growth),
    };
  }, [payrollData.summary, filteredPayrollRecords]);

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

  const exportColumns = [
    { key: "employeeId", label: "Employee ID" },
    { key: "employeeName", label: "Employee Name" },
    { key: "department", label: "Department" },
    { key: "position", label: "Position" },
    { key: "baseSalary", label: "Base Salary", format: "currency" },
    { key: "bonus", label: "Bonus", format: "currency" },
    { key: "deductions", label: "Deductions", format: "currency" },
    { key: "netPay", label: "Net Pay", format: "currency" },
    { key: "payPeriod", label: "Pay Period" },
    { key: "status", label: "Status" },
    { key: "paymentDate", label: "Payment Date", format: "date" },
  ];

  const [showExportDropdown, setShowExportDropdown] = useState(false);

  const handleExport = (format) => {
    setShowExportDropdown(false);
    if (!filteredPayrollRecords || filteredPayrollRecords.length === 0) return;
    const filename = `payroll-report-${selectedPeriod}`;
    if (format === "csv") exportToCSV(filteredPayrollRecords, exportColumns, filename);
    else if (format === "excel") exportToExcel(filteredPayrollRecords, exportColumns, filename);
    else if (format === "pdf") exportToPDF(filteredPayrollRecords, exportColumns, "Payroll Report", filename);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedDepartment("all");
    setSelectedPeriod("monthly");
  };

  const renderEmptyState = (title, message) => (
    <div className="payroll-empty-state">
      <FontAwesomeIcon icon={faTriangleExclamation} />
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );

  return (
    <div className="payroll-reports">
      <section className="payroll-reports-hero">
        <div>
          <span className="payroll-eyebrow">
            <FontAwesomeIcon icon={faMoneyBillWave} />
            Payroll Analytics
          </span>

          <h1>Payroll Reports & Analytics</h1>
          <p>
            Review salary totals, department spending, payroll trends, top earners,
            and payroll records from live backend data.
          </p>

          <small>Last updated: {lastUpdated || "Not refreshed yet"}</small>
        </div>

        <div className="payroll-header-actions">
          <button
            type="button"
            className={`payroll-secondary-btn ${refreshing ? "refreshing" : ""}`}
            onClick={() => loadPayrollData({ silent: true })}
            disabled={refreshing}
          >
            <FontAwesomeIcon icon={refreshing ? faSpinner : faRotateRight} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

          <div style={{ position: "relative" }}>
            <button type="button" className="payroll-secondary-btn" onClick={() => setShowExportDropdown(!showExportDropdown)}>
              <FontAwesomeIcon icon={faFileCsv} />
              Export ▼
            </button>
            {showExportDropdown && (
              <>
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} onClick={() => setShowExportDropdown(false)} />
                <div style={{ position: "absolute", top: "100%", right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 999, minWidth: 160, overflow: "hidden" }}>
                  <button type="button" style={{ display: "block", width: "100%", padding: "10px 16px", border: "none", background: "#fff", color: "#374151", fontSize: 13, textAlign: "left", cursor: "pointer" }} onClick={() => handleExport("csv")}>Export as CSV</button>
                  <button type="button" style={{ display: "block", width: "100%", padding: "10px 16px", border: "none", background: "#fff", color: "#374151", fontSize: 13, textAlign: "left", cursor: "pointer" }} onClick={() => handleExport("excel")}>Export as Excel</button>
                  <button type="button" style={{ display: "block", width: "100%", padding: "10px 16px", border: "none", background: "#fff", color: "#374151", fontSize: 13, textAlign: "left", cursor: "pointer" }} onClick={() => handleExport("pdf")}>Export as PDF</button>
                </div>
              </>
            )}
          </div>

          <button type="button" className="payroll-primary-btn" onClick={() => window.print()}>
            <FontAwesomeIcon icon={faFilePdf} />
            Print / PDF
          </button>
        </div>
      </section>

      <section className="payroll-controls">
        <div className="payroll-search-box">
          <FontAwesomeIcon icon={faMagnifyingGlass} />
          <input
            type="text"
            placeholder="Search employee, ID, department, position, status..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm("")}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>

        <label className="payroll-filter-box">
          <FontAwesomeIcon icon={faCalendarAlt} />
          <select
            value={selectedPeriod}
            onChange={(event) => setSelectedPeriod(event.target.value)}
          >
            {PERIODS.map((period) => (
              <option key={period} value={period}>
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <label className="payroll-filter-box">
          <FontAwesomeIcon icon={faFilter} />
          <select
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
        </label>

        <button type="button" className="payroll-clear-btn" onClick={clearFilters}>
          <FontAwesomeIcon icon={faTimes} />
          Clear
        </button>
      </section>

      <section className="payroll-report-tabs">
        {REPORT_TYPES.map((type) => (
          <button
            key={type.key}
            type="button"
            className={reportType === type.key ? "active" : ""}
            onClick={() => setReportType(type.key)}
          >
            <FontAwesomeIcon icon={type.icon} />
            {type.label}
          </button>
        ))}
      </section>

      {loading && (
        <div className="payroll-loading-state">
          <FontAwesomeIcon icon={faSpinner} spin />
          <h3>Loading payroll data...</h3>
          <p>Please wait while the system prepares the payroll report.</p>
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
          {reportType === "summary" && (
            <section className="payroll-report-content">
              <div className="payroll-summary-grid">
                <article className="payroll-summary-card">
                  <span>
                    <FontAwesomeIcon icon={faMoneyBillWave} />
                  </span>
                  <div>
                    <strong>{formatCurrency(derivedSummary.totalPayroll)}</strong>
                    <p>Total Payroll</p>
                    <small className={`growth-indicator ${getGrowthColor(derivedSummary.growth)}`}>
                      <FontAwesomeIcon icon={getGrowthIcon(derivedSummary.growth)} />
                      {derivedSummary.growth || 0}% growth
                    </small>
                  </div>
                </article>

                <article className="payroll-summary-card">
                  <span>
                    <FontAwesomeIcon icon={faUsers} />
                  </span>
                  <div>
                    <strong>{derivedSummary.totalEmployees}</strong>
                    <p>Total Employees</p>
                    <small>Filtered payroll records</small>
                  </div>
                </article>

                <article className="payroll-summary-card">
                  <span>
                    <FontAwesomeIcon icon={faChartBar} />
                  </span>
                  <div>
                    <strong>{formatCurrency(derivedSummary.averageSalary)}</strong>
                    <p>Average Salary</p>
                    <small>Based on net pay</small>
                  </div>
                </article>

                <article className="payroll-summary-card">
                  <span>
                    <FontAwesomeIcon icon={faWallet} />
                  </span>
                  <div>
                    <strong>{formatCurrency(derivedSummary.totalBonuses)}</strong>
                    <p>Total Bonuses</p>
                    <small>
                      Deductions: {formatCurrency(derivedSummary.totalDeductions)}
                    </small>
                  </div>
                </article>
              </div>

              <div className="payroll-dashboard-grid">
                <article className="payroll-panel">
                  <div className="payroll-panel-heading">
                    <div>
                      <h3>Department Cost Overview</h3>
                      <p>Distribution of payroll spending by department.</p>
                    </div>
                  </div>

                  {departmentBreakdown.length === 0 ? (
                    renderEmptyState("No department data", "No department breakdown was returned.")
                  ) : (
                    <div className="payroll-chart-box">
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={departmentBreakdown}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="department" />
                          <YAxis tickFormatter={(value) => `₱${value / 1000}k`} />
                          <Tooltip formatter={(value) => formatCurrency(value)} />
                          <Bar dataKey="totalSalary" name="Total Salary" radius={[12, 12, 0, 0]}>
                            {departmentBreakdown.map((entry, index) => (
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

                <article className="payroll-panel payroll-health-panel">
                  <div className="payroll-panel-heading">
                    <div>
                      <h3>Payroll Snapshot</h3>
                      <p>Quick view of the current payroll dataset.</p>
                    </div>
                  </div>

                  <div className="payroll-health-list">
                    <div>
                      <span>Records</span>
                      <strong>{filteredPayrollRecords.length}</strong>
                    </div>
                    <div>
                      <span>Departments</span>
                      <strong>{departmentBreakdown.length}</strong>
                    </div>
                    <div>
                      <span>Top Earners</span>
                      <strong>{topEarnersData.length}</strong>
                    </div>
                    <div>
                      <span>Period</span>
                      <strong>{selectedPeriod}</strong>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          )}

          {reportType === "department" && (
            <section className="payroll-report-content">
              <article className="payroll-panel">
                <div className="payroll-panel-heading">
                  <div>
                    <h3>Department Payroll Comparison</h3>
                    <p>Compare employee count, total salary, average salary, and growth.</p>
                  </div>
                </div>

                {filteredDepartmentData.length === 0 ? (
                  renderEmptyState("No department records", "Try changing the department filter.")
                ) : (
                  <>
                    <div className="payroll-chart-box">
                      <ResponsiveContainer width="100%" height={340}>
                        <BarChart data={filteredDepartmentData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="department" />
                          <YAxis tickFormatter={(value) => `₱${value / 1000}k`} />
                          <Tooltip formatter={(value) => formatCurrency(value)} />
                          <Bar dataKey="totalSalary" name="Total Salary" radius={[12, 12, 0, 0]}>
                            {filteredDepartmentData.map((entry, index) => (
                              <Cell
                                key={entry.department}
                                fill={CHART_COLORS[index % CHART_COLORS.length]}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <StandardTable
                      columns={[
                        { key: "department", label: "Department", sortable: true, render: (value) => (
                          <div className="department-name">
                            <FontAwesomeIcon icon={faBuilding} />
                            {value}
                          </div>
                        )},
                        { key: "employees", label: "Employees", sortable: true },
                        { key: "totalSalary", label: "Total Salary", sortable: true, format: "currency" },
                        { key: "average", label: "Average Salary", sortable: true, format: "currency" },
                        { key: "percentage", label: "% of Total", sortable: true, render: (value) => `${value || 0}%` },
                        { key: "trend", label: "Trend", sortable: true, render: (value) => (
                          <span className={`trend-indicator ${getGrowthColor(value)}`}>
                            <FontAwesomeIcon icon={getGrowthIcon(value)} />
                            {value || 0}%
                          </span>
                        )},
                      ]}
                      data={filteredDepartmentData}
                      emptyMessage="No department data found."
                      pageSize={10}
                    />
                  </>
                )}
              </article>
            </section>
          )}

          {reportType === "trend" && (
            <section className="payroll-report-content">
              <article className="payroll-panel">
                <div className="payroll-panel-heading">
                  <div>
                    <h3>Payroll Growth Analysis</h3>
                    <p>Payroll amount and employee count movement across periods.</p>
                  </div>
                </div>

                {monthlyTrendData.length === 0 ? (
                  renderEmptyState("No trend data", "Monthly trend data is not available yet.")
                ) : (
                  <div className="payroll-chart-box large">
                    <ResponsiveContainer width="100%" height={360}>
                      <LineChart data={monthlyTrendData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" />
                        <YAxis yAxisId="left" tickFormatter={(value) => `₱${value / 1000}k`} />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip
                          formatter={(value, name) =>
                            name === "payroll" ? formatCurrency(value) : value
                          }
                        />
                        <Legend />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="payroll"
                          name="Payroll"
                          stroke="#ff5f93"
                          strokeWidth={4}
                          dot={{ r: 5 }}
                          activeDot={{ r: 8 }}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="employees"
                          name="Employees"
                          stroke="#fb7185"
                          strokeWidth={3}
                          dot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="trend-insights">
                  <div className="insight-card">
                    <h4>Key Insight</h4>
                    <p>
                      Payroll insights are based on live payroll records returned by the
                      backend. No fake or fallback business values are displayed.
                    </p>
                  </div>

                  <div className="insight-card">
                    <h4>Forecast Status</h4>
                    <p>
                      Forecasting is unavailable unless the backend provides projected
                      payroll data.
                    </p>
                    <p>Current employee count: {derivedSummary.totalEmployees}</p>
                  </div>
                </div>
              </article>
            </section>
          )}

          {reportType === "topEarners" && (
            <section className="payroll-report-content">
              <article className="payroll-panel">
                <div className="payroll-panel-heading">
                  <div>
                    <h3>Top Earners by Net Pay</h3>
                    <p>Highest earning employees based on available payroll records.</p>
                  </div>
                </div>

                {topEarnersData.length === 0 ? (
                  renderEmptyState("No top earners", "No payroll records are available.")
                ) : (
                  <>
                    <div className="earners-list">
                      {topEarnersData.map((earner, index) => (
                        <div key={earner.id || earner.name} className="earner-card">
                          <div className="earner-rank">#{index + 1}</div>
                          <div className="earner-info">
                            <h4>{earner.name}</h4>
                            <p>{earner.position}</p>
                            <span>{earner.department}</span>
                          </div>
                          <div className="earner-salary">
                            <strong>{formatCurrency(earner.salary)}</strong>
                            <small>net pay</small>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="payroll-chart-box">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={topEarnersData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" />
                          <YAxis tickFormatter={(value) => `₱${value / 1000}k`} />
                          <Tooltip formatter={(value) => formatCurrency(value)} />
                          <Bar dataKey="salary" name="Salary" radius={[12, 12, 0, 0]}>
                            {topEarnersData.map((entry, index) => (
                              <Cell
                                key={entry.id || entry.name}
                                fill={CHART_COLORS[index % CHART_COLORS.length]}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
              </article>
            </section>
          )}

          {reportType === "records" && (
            <section className="payroll-report-content">
              <article className="payroll-panel">
                <div className="payroll-panel-heading">
                  <div>
                    <h3>Payroll Records</h3>
                    <p>
                      Showing {filteredPayrollRecords.length} payroll record(s) from the
                      current filters.
                    </p>
                  </div>
                </div>

                <StandardTable
                  columns={[
                    { key: "employeeName", label: "Employee", sortable: true, render: (value, record) => (
                      <div className="employee-cell">
                        <span><FontAwesomeIcon icon={faUserTie} /></span>
                        <div>
                          <strong>{value}</strong>
                          <small>{record.employeeId}</small>
                        </div>
                      </div>
                    )},
                    { key: "department", label: "Department", sortable: true },
                    { key: "baseSalary", label: "Base Salary", sortable: true, format: "currency" },
                    { key: "bonus", label: "Bonus", sortable: true, render: (value) => (
                      <span className="amount-positive">+{formatCurrency(value)}</span>
                    )},
                    { key: "deductions", label: "Deductions", sortable: true, render: (value) => (
                      <span className="amount-negative">-{formatCurrency(value)}</span>
                    )},
                    { key: "netPay", label: "Net Pay", sortable: true, render: (value) => (
                      <span className="net-pay">{formatCurrency(value)}</span>
                    )},
                    { key: "payPeriod", label: "Period", sortable: true },
                    { key: "status", label: "Status", sortable: true, render: (value) => (
                      <span className={`status-pill ${value}`}>{value}</span>
                    )},
                    { key: "paymentDate", label: "Date", sortable: true, render: (value, record) => formatDate(value || record.createdAt) },
                    { key: "actions", label: "Action", sortable: false, render: (_value, record) => (
                      <button
                        type="button"
                        className="view-record-btn"
                        onClick={() => setSelectedRecord(record)}
                      >
                        <FontAwesomeIcon icon={faEye} />
                        View
                      </button>
                    )},
                  ]}
                  data={filteredPayrollRecords}
                  emptyMessage="No payroll records found. Try clearing the filters."
                  pageSize={10}
                />
              </article>
            </section>
          )}

          <section className="payroll-export-panel">
            <div>
              <h3>Export Options</h3>
              <p>Download filtered payroll records or print the current report view.</p>
            </div>

            <div className="payroll-export-actions">
              <button type="button" onClick={() => handleExport("csv")}>
                <FontAwesomeIcon icon={faFileCsv} />
                Download CSV
              </button>

              <button type="button" onClick={() => handleExport("excel")}>
                <FontAwesomeIcon icon={faFileExcel} />
                Download Excel
              </button>

              <button type="button" onClick={() => handleExport("pdf")}>
                <FontAwesomeIcon icon={faFilePdf} />
                Download PDF
              </button>

              <button type="button" onClick={() => window.print()}>
                <FontAwesomeIcon icon={faPrint} />
                Print
              </button>

              <button
                type="button"
                onClick={() => loadPayrollData({ silent: true })}
                disabled={refreshing}
              >
                <FontAwesomeIcon icon={refreshing ? faSpinner : faRotateRight} />
                Refresh Data
              </button>
            </div>
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
                  Payroll Record
                </span>
                <h2>{selectedRecord.employeeName}</h2>
              </div>

              <button type="button" onClick={() => setSelectedRecord(null)}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="payroll-modal-body">
              <div className="record-detail-grid">
                <div>
                  <small>Employee ID</small>
                  <strong>{selectedRecord.employeeId}</strong>
                </div>
                <div>
                  <small>Department</small>
                  <strong>{selectedRecord.department}</strong>
                </div>
                <div>
                  <small>Position</small>
                  <strong>{selectedRecord.position}</strong>
                </div>
                <div>
                  <small>Pay Period</small>
                  <strong>{selectedRecord.payPeriod}</strong>
                </div>
                <div>
                  <small>Status</small>
                  <strong>{selectedRecord.status}</strong>
                </div>
                <div>
                  <small>Payment Date</small>
                  <strong>{formatDate(selectedRecord.paymentDate)}</strong>
                </div>
              </div>

              <div className="modal-breakdown">
                <h3>Payroll Breakdown</h3>
                <div>
                  <span>Base Salary</span>
                  <strong>{formatCurrency(selectedRecord.baseSalary)}</strong>
                </div>
                <div>
                  <span>Bonus</span>
                  <strong className="amount-positive">
                    +{formatCurrency(selectedRecord.bonus)}
                  </strong>
                </div>
                <div>
                  <span>Deductions</span>
                  <strong className="amount-negative">
                    -{formatCurrency(selectedRecord.deductions)}
                  </strong>
                </div>
                <div className="total">
                  <span>Net Pay</span>
                  <strong>{formatCurrency(selectedRecord.netPay)}</strong>
                </div>
              </div>
            </div>

            <div className="payroll-modal-footer">
              <button type="button" onClick={() => setSelectedRecord(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollReports;
