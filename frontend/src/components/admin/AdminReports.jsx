import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBox,
  faCalendarCheck,
  faChartLine,
  faClipboardList,
  faCreditCard,
  faFileCsv,
  faFileExcel,
  faFilePdf,
  faHeartbeat,
  faMagnifyingGlass,
  faMoneyBillWave,
  faRotateRight,
  faShieldHalved,
  faSpinner,
  faStethoscope,
  faTimes,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import StandardTable from "../shared/StandardTable";
import { exportToCSV, exportToExcel, exportToPDF, getDateRangePreset } from "../../utils/reportExport";
import "./AdminReports.css";

const SECTION_CONFIG = [
  {
    key: "executive",
    label: "Executive Summary",
    endpoint: "/admin/reports/overview",
    icon: faChartLine,
    tableKeys: ["pending_operations", "recent_actions", "transactions"],
    tableTitle: "Priority Activity",
  },
  {
    key: "orders",
    label: "Sales / Orders",
    endpoint: "/admin/reports/orders",
    icon: faMoneyBillWave,
    tableKeys: ["orders", "sales", "transactions"],
    tableTitle: "Order Records",
  },
  {
    key: "payments",
    label: "Payments",
    endpoint: "/admin/reports/payments",
    icon: faCreditCard,
    tableKeys: ["payments", "payment_verifications", "transactions"],
    tableTitle: "Payment Records",
  },
  {
    key: "services",
    label: "Services / Bookings",
    endpoint: "/admin/reports/services",
    icon: faClipboardList,
    tableKeys: ["requests", "appointments", "boardings"],
    tableTitle: "Booking Records",
  },
  {
    key: "inventory",
    label: "Inventory",
    endpoint: "/admin/reports/inventory",
    icon: faBox,
    tableKeys: ["logs", "items", "fast_moving_products"],
    tableTitle: "Inventory Records",
  },
  {
    key: "customers",
    label: "Customers",
    endpoint: "/admin/reports/customers",
    icon: faUsers,
    tableKeys: ["customers", "orders", "data"],
    tableTitle: "Customer Records",
  },
  {
    key: "veterinary",
    label: "Veterinary",
    endpoint: "/admin/reports/veterinary",
    icon: faStethoscope,
    tableKeys: ["appointments", "medical_confinements", "service_breakdown"],
    tableTitle: "Veterinary Records",
  },
  {
    key: "cashier",
    label: "Cashier / POS",
    endpoint: "/admin/reports/cashier",
    icon: faMoneyBillWave,
    tableKeys: ["transactions", "payment_verifications", "orders"],
    tableTitle: "Cashier Records",
  },
  {
    key: "payroll",
    label: "Staff / Payroll",
    endpoint: "/admin/reports/payroll",
    icon: faCalendarCheck,
    tableKeys: ["payrolls", "topEarners", "departmentBreakdown"],
    tableTitle: "Payroll Records",
  },
  {
    key: "system",
    label: "System Health / Audit Logs",
    endpoint: "/admin/reports/system-health",
    icon: faShieldHalved,
    tableKeys: ["audit_logs", "users_by_role", "notifications"],
    tableTitle: "System Records",
  },
];

const DATE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
];

const STATUS_OPTIONS = [
  "all",
  "pending",
  "approved",
  "scheduled",
  "completed",
  "paid",
  "rejected",
  "cancelled",
];

const safeArray = (value) => (Array.isArray(value) ? value : []);
const searchable = (value) => String(value ?? "").toLowerCase();
const titleize = (value) =>
  String(value || "Metric")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const unwrapPayload = (res) => {
  if (res?.data?.data && typeof res.data.data === "object" && !Array.isArray(res.data.data)) {
    return { ...res.data.data, success: res.success ?? res.data.success, summary: res.summary ?? res.data.summary ?? res.data.data.summary, charts: res.charts ?? res.data.charts ?? res.data.data.charts };
  }

  if (res?.data && typeof res.data === "object" && !Array.isArray(res.data)) {
    return { ...res.data, success: res.success ?? res.data.success, summary: res.summary ?? res.data.summary, charts: res.charts ?? res.data.charts };
  }

  return res || {};
};

export const normalizeReportResponse = (res, tableKeys = []) => {
  const payload = unwrapPayload(res);
  const nestedData = payload.data && typeof payload.data === "object" ? payload.data : {};

  let table = [];
  for (const key of tableKeys) {
    if (Array.isArray(payload[key])) {
      table = payload[key];
      break;
    }
    if (Array.isArray(nestedData[key])) {
      table = nestedData[key];
      break;
    }
  }

  if (table.length === 0) {
    table = Array.isArray(payload.table)
      ? payload.table
      : Array.isArray(nestedData.table)
        ? nestedData.table
        : Array.isArray(payload.data)
          ? payload.data
          : [];
  }

  return {
    success: payload.success !== false,
    section: payload.section || nestedData.section || null,
    summary: payload.summary || nestedData.summary || {},
    charts: payload.charts || nestedData.charts || {},
    table,
    lastUpdated:
      payload.last_updated ||
      payload.lastUpdated ||
      payload.generated_at ||
      nestedData.last_updated ||
      nestedData.generated_at ||
      null,
  };
};

const getPresetRange = (preset) => {
  const today = new Date();
  const toDate = today.toISOString().slice(0, 10);

  if (preset === "today") {
    return { startDate: toDate, endDate: toDate };
  }

  if (preset === "7d" || preset === "30d") {
    const days = preset === "7d" ? 6 : 29;
    const from = new Date(today);
    from.setDate(today.getDate() - days);
    return { startDate: from.toISOString().slice(0, 10), endDate: toDate };
  }

  return getDateRangePreset("month");
};

const getNumericValue = (summary, keys) => {
  for (const key of keys) {
    if (summary?.[key] !== undefined && summary?.[key] !== null) return Number(summary[key]) || 0;
  }
  return 0;
};

const formatReportTimestamp = (timestamp) => {
  const parsed = new Date(String(timestamp).replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? new Date().toLocaleString("en-PH") : parsed.toLocaleString("en-PH");
};

const buildColumns = (rows) => {
  const priority = [
    "id",
    "date",
    "created_at",
    "customer_name",
    "customer_display",
    "customer",
    "service_name",
    "associated_record",
    "item_name",
    "status",
    "payment_status",
    "amount",
    "total_amount",
  ];
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
  const ordered = [...priority.filter((key) => keys.includes(key)), ...keys.filter((key) => !priority.includes(key))];

  return ordered.slice(0, 8).map((key) => ({
    key,
    label: titleize(key),
    sortable: true,
    format: key.includes("amount") || key.includes("revenue") || key.includes("payroll") ? "currency" : key.includes("date") || key.endsWith("_at") ? "datetime" : undefined,
  }));
};

const AdminReports = () => {
  const [activeSection, setActiveSection] = useState("executive");
  const [reports, setReports] = useState({});
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [datePreset, setDatePreset] = useState("month");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");

  const activeConfig = SECTION_CONFIG.find((section) => section.key === activeSection) || SECTION_CONFIG[0];
  const activeReport = reports[activeSection] || { summary: {}, charts: {}, table: [] };
  const executiveSummary = overview?.summary || activeReport.summary || {};

  const buildEndpoint = useCallback(
    (config) => {
      const params = new URLSearchParams();
      const range = getPresetRange(datePreset);

      if (range.startDate) params.set("from", range.startDate);
      if (range.endDate) params.set("to", range.endDate);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (paymentStatusFilter !== "all") params.set("payment_status", paymentStatusFilter);

      const query = params.toString();
      return query ? `${config.endpoint}?${query}` : config.endpoint;
    },
    [datePreset, paymentStatusFilter, statusFilter]
  );

  const fetchReport = useCallback(
    async (sectionKey = activeSection, { silent = false } = {}) => {
      const config = SECTION_CONFIG.find((section) => section.key === sectionKey) || SECTION_CONFIG[0];

      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError("");

        const response = await apiRequest(buildEndpoint(config));
        const normalized = normalizeReportResponse(response, config.tableKeys);
        const timestamp = normalized.lastUpdated || new Date().toISOString();

        setReports((previous) => ({
          ...previous,
          [sectionKey]: normalized,
        }));

        if (sectionKey === "executive") {
          setOverview(normalized);
        }

        setLastUpdated(formatReportTimestamp(timestamp));
      } catch (err) {
        console.error(`${config.label} report fetch failed:`, {
          message: err?.message,
          status: err?.status,
          response: err?.response,
          url: err?.url,
        });
        setError(err.message || `Failed to load ${config.label}.`);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeSection, buildEndpoint]
  );

  useEffect(() => {
    fetchReport(activeSection);
  }, [activeSection, fetchReport]);

  useEffect(() => {
    if (activeSection !== "executive" && !overview) {
      fetchReport("executive", { silent: true });
    }
  }, [activeSection, fetchReport, overview]);

  const filteredRows = useMemo(() => {
    const rows = safeArray(activeReport.table);
    const search = searchTerm.trim().toLowerCase();

    if (!search) return rows;

    return rows.filter((row) =>
      Object.values(row || {}).some((value) => searchable(value).includes(search))
    );
  }, [activeReport.table, searchTerm]);

  const tableColumns = useMemo(() => buildColumns(filteredRows), [filteredRows]);

  const statusChart = useMemo(() => {
    const map = new Map();
    filteredRows.forEach((row) => {
      const status = row?.status || row?.payment_status || row?.role || "record";
      map.set(status, (map.get(status) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name: titleize(name), count }));
  }, [filteredRows]);

  const summaryCards = useMemo(() => {
    const summary = activeReport.summary || {};
    const keys = Object.keys(summary).filter((key) => typeof summary[key] !== "object").slice(0, 6);

    if (keys.length === 0) {
      return [
        { key: "rows", label: "Report Rows", value: filteredRows.length },
        { key: "status_count", label: "Status Groups", value: statusChart.length },
      ];
    }

    return keys.map((key) => {
      const value = summary[key];
      const isCurrency = key.includes("revenue") || key.includes("amount") || key.includes("payroll") || key.includes("salary");
      return {
        key,
        label: titleize(key),
        value: isCurrency ? formatCurrency(Number(value) || 0) : value ?? 0,
      };
    });
  }, [activeReport.summary, filteredRows.length, statusChart.length]);

  const headerKpis = [
    {
      label: "Total Revenue",
      value: formatCurrency(getNumericValue(executiveSummary, ["total_revenue", "today_revenue"])),
      icon: faMoneyBillWave,
    },
    {
      label: "Pending Payments",
      value: getNumericValue(executiveSummary, ["pending_payments", "pending_payment_proofs"]),
      icon: faCreditCard,
    },
    {
      label: "Pending Bookings",
      value: getNumericValue(executiveSummary, ["pending_approvals", "pending_requests"]),
      icon: faClipboardList,
    },
    {
      label: "Low Stock Items",
      value: getNumericValue(executiveSummary, ["low_stock_items"]),
      icon: faBox,
    },
    {
      label: "Completed Services",
      value: getNumericValue(executiveSummary, ["completed_services", "completed_appointments"]),
      icon: faHeartbeat,
    },
    {
      label: "Total Customers",
      value: getNumericValue(executiveSummary, ["total_customers"]),
      icon: faUsers,
    },
  ];

  const exportColumns = tableColumns.length ? tableColumns : [{ key: "id", label: "ID" }];

  const refreshActive = () => fetchReport(activeSection, { silent: true });

  return (
    <main className="admin-reports-page">
      <section className="reports-hero">
        <div>
          <span className="reports-eyebrow">
            <FontAwesomeIcon icon={activeConfig.icon} />
            Admin Analytics
          </span>
          <h1>Reports Center</h1>
          <p>
            A live reporting workspace for revenue, payments, bookings, inventory, customers, staff, and system health.
          </p>
          <small>Last updated: {lastUpdated || "Not refreshed yet"}</small>
        </div>

        <div className="reports-hero-actions">
          <span className="admin-role-badge">
            <FontAwesomeIcon icon={faShieldHalved} />
            System Role: Admin
          </span>
          <button
            type="button"
            className={`refresh-report-btn ${refreshing ? "refreshing" : ""}`}
            onClick={refreshActive}
            disabled={refreshing || loading}
          >
            <FontAwesomeIcon icon={refreshing ? faSpinner : faRotateRight} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      <section className="reports-kpi-grid" aria-label="Live report KPIs">
        {headerKpis.map((kpi) => (
          <article className="reports-kpi-card" key={kpi.label}>
            <span>
              <FontAwesomeIcon icon={kpi.icon} />
            </span>
            <div>
              <strong>{kpi.value}</strong>
              <p>{kpi.label}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="admin-reports-navigation" aria-label="Report categories">
        <nav className="nav-tabs">
          {SECTION_CONFIG.map((section) => (
            <button
              key={section.key}
              type="button"
              className={`nav-tab ${activeSection === section.key ? "active" : ""}`}
              onClick={() => {
                setActiveSection(section.key);
                setSearchTerm("");
              }}
            >
              <FontAwesomeIcon icon={section.icon} />
              {section.label}
            </button>
          ))}
        </nav>
      </section>

      <section className="admin-report-filter-card">
        <div className="admin-report-search">
          <FontAwesomeIcon icon={faMagnifyingGlass} />
          <input
            type="text"
            value={searchTerm}
            placeholder={`Search ${activeConfig.tableTitle.toLowerCase()} only...`}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm("")} aria-label="Clear search">
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>

        <div className="admin-report-filter-grid compact">
          <label>
            Date Range
            <select value={datePreset} onChange={(event) => setDatePreset(event.target.value)}>
              {DATE_PRESETS.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {titleize(status)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Payment Status
            <select value={paymentStatusFilter} onChange={(event) => setPaymentStatusFilter(event.target.value)}>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {titleize(status)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error && (
        <section className="reports-state-card error compact-state">
          <FontAwesomeIcon icon={faTimes} />
          <div>
            <h3>Unable to refresh {activeConfig.label}</h3>
            <p>{error} Previous report data remains visible when available.</p>
          </div>
          <button type="button" onClick={refreshActive}>Retry</button>
        </section>
      )}

      {loading && !activeReport.table?.length ? (
        <section className="reports-skeleton-grid">
          {[1, 2, 3].map((item) => (
            <div className="reports-skeleton-card" key={item} />
          ))}
        </section>
      ) : (
        <section className="reports-content">
          <div className="reports-section-heading">
            <div>
              <span className="reports-eyebrow">
                <FontAwesomeIcon icon={activeConfig.icon} />
                {activeConfig.label}
              </span>
              <h2>{activeConfig.label}</h2>
              <p>{filteredRows.length} row(s) in the current table view.</p>
            </div>
            <div className="table-action-group">
              <button type="button" onClick={() => exportToCSV(filteredRows, exportColumns, `admin-${activeSection}-report`)}>
                <FontAwesomeIcon icon={faFileCsv} />
                CSV
              </button>
              <button type="button" onClick={() => exportToExcel(filteredRows, exportColumns, `admin-${activeSection}-report`)}>
                <FontAwesomeIcon icon={faFileExcel} />
                Excel
              </button>
              <button type="button" onClick={() => exportToPDF(filteredRows, exportColumns, activeConfig.label, `admin-${activeSection}-report`)}>
                <FontAwesomeIcon icon={faFilePdf} />
                PDF
              </button>
            </div>
          </div>

          <section className="reports-summary-grid">
            {summaryCards.map((card) => (
              <article className="reports-summary-card" key={card.key}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </article>
            ))}
          </section>

          <section className="admin-report-grid">
            <article className="premium-report-panel">
              <div className="report-panel-heading">
                <div>
                  <h3>Status Breakdown</h3>
                  <p>Counts are calculated from the current live table rows.</p>
                </div>
              </div>
              {statusChart.length === 0 ? (
                <div className="reports-empty-mini">
                  <FontAwesomeIcon icon={faChartLine} />
                  <p>No chart data available for this report.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={statusChart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[10, 10, 0, 0]}>
                      {statusChart.map((item, index) => (
                        <Cell key={item.name} fill={["#ff5f93", "#ff8db5", "#fb7185", "#f472b6"][index % 4]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </article>

            <article className="premium-report-panel report-health-panel">
              <div className="report-panel-heading">
                <div>
                  <h3>Report Snapshot</h3>
                  <p>Useful live-data context for this section.</p>
                </div>
              </div>
              <div className="report-health-list">
                <div>
                  <span>Endpoint</span>
                  <strong>{activeConfig.endpoint}</strong>
                </div>
                <div>
                  <span>Rows</span>
                  <strong>{filteredRows.length}</strong>
                </div>
                <div>
                  <span>Filters</span>
                  <strong>{datePreset}</strong>
                </div>
              </div>
            </article>
          </section>

          <section className="premium-report-panel data-table-section">
            <div className="report-panel-heading">
              <div>
                <h3>{activeConfig.tableTitle}</h3>
                <p>Search and filters apply to this table only.</p>
              </div>
            </div>
            <StandardTable
              columns={tableColumns}
              data={filteredRows}
              loading={loading}
              emptyMessage={`No ${activeConfig.label.toLowerCase()} records found for the selected filters.`}
              pageSize={12}
            />
          </section>
        </section>
      )}
    </main>
  );
};

export default AdminReports;
