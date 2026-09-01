import React, { useCallback, useEffect, useMemo, useState, Suspense, lazy } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBox,
  faChartLine,
  faClipboardList,
  faCreditCard,
  faMoneyBillWave,
  faShieldHalved,
  faServer,
  faStethoscope,
  faUsers,
  faSync,
  faExclamationTriangle,
  faCheckCircle,
  faClock,
} from "@fortawesome/free-solid-svg-icons";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { getDateRangePreset } from "../../utils/reportExport";
import UnifiedReportEngine, { SummaryCards, ChartContainer, CHART_COLORS } from "../shared/UnifiedReportEngine";
import ReportErrorBoundary from "../shared/ReportErrorBoundary";
import ReportSkeleton from "../shared/ReportSkeleton";
import ApiHealthCheck from "./ApiHealthCheck";
import "./AdminReports.css";

// Lazy load advanced report components for code splitting
const ExecutiveDashboard = lazy(() => import("./reports/ExecutiveDashboard"));
const StaffPerformance = lazy(() => import("./reports/StaffPerformance"));

// Loading fallback component - uses skeleton for better UX
const AdvancedReportLoading = () => <ReportSkeleton type="minimal" />;

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
    key: "system",
    label: "System Health / Audit Logs",
    endpoint: "/admin/reports/system-health",
    icon: faShieldHalved,
    tableKeys: ["audit_logs", "users_by_role", "notifications"],
    tableTitle: "System Records",
  },
  {
    key: "dashboard",
    label: "Executive Dashboard",
    endpoint: "/admin/reports/executive",
    icon: faChartLine,
    tableKeys: [],
    tableTitle: "Executive View",
    isAdvanced: true,
  },
  {
    key: "staff_perf",
    label: "Staff Performance",
    endpoint: "/admin/reports/staff-performance",
    icon: faUsers,
    tableKeys: [],
    tableTitle: "Team Analytics",
    isAdvanced: true,
  },
  {
    key: "api_health",
    label: "API Health Check",
    endpoint: "/health",
    icon: faServer,
    tableKeys: [],
    tableTitle: "Backend Status",
    isAdvanced: false,
    isUtility: true,
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

  // Extract trend data from various backend response shapes
  const trend =
    payload.charts?.trend ||
    nestedData.charts?.trend ||
    payload.trend ||
    nestedData.trend ||
    payload.revenue_trend ||
    nestedData.revenue_trend ||
    [];

  return {
    success: payload.success !== false,
    section: payload.section || nestedData.section || null,
    summary: payload.summary || nestedData.summary || {},
    charts: {
      ...(payload.charts || nestedData.charts || {}),
      trend,
    },
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
        if (!silent) {
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
      }
    },
    [activeSection, buildEndpoint]
  );

  // Only manually fetch for advanced sections (dashboard, staff_perf, api_health).
  // Non-advanced sections are fetched exclusively by UnifiedReportEngine to avoid double-fetch race conditions.
  useEffect(() => {
    if (activeConfig.isAdvanced) {
      fetchReport(activeSection);
    }
  }, [activeSection, fetchReport, activeConfig.isAdvanced]);

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

  // KPI data - real values only, no fake trends
  const headerKpis = useMemo(() => {
    const summary = executiveSummary;
    return [
      {
        id: "revenue",
        label: "Total Revenue",
        value: formatCurrency(getNumericValue(summary, ["total_revenue", "today_revenue", "monthly_revenue"])),
        icon: faMoneyBillWave,
        tone: "money",
      },
      {
        id: "pending_payments",
        label: "Pending Payments",
        value: getNumericValue(summary, ["pending_payments", "pending_payment_proofs"]),
        icon: faCreditCard,
        tone: "warning",
      },
      {
        id: "pending_bookings",
        label: "Pending Bookings",
        value: getNumericValue(summary, ["pending_approvals", "pending_requests", "pending_bookings"]),
        icon: faClipboardList,
        tone: "info",
      },
      {
        id: "low_stock",
        label: "Low Stock Items",
        value: getNumericValue(summary, ["low_stock_items", "low_stock_count"]),
        icon: faBox,
        tone: getNumericValue(summary, ["low_stock_items"]) > 10 ? "danger" : "warning",
      },
      {
        id: "completed",
        label: "Completed Services",
        value: getNumericValue(summary, ["completed_services", "completed_appointments", "total_completed"]),
        icon: faCheckCircle,
        tone: "success",
      },
      {
        id: "customers",
        label: "Total Customers",
        value: getNumericValue(summary, ["total_customers", "customer_count"]),
        icon: faUsers,
        tone: "primary",
      },
    ];
  }, [executiveSummary]);

  // Enhanced chart data
  const enhancedCharts = useMemo(() => {
    const rows = safeArray(activeReport.table);
    
    // Status breakdown for bar chart
    const statusMap = new Map();
    rows.forEach((row) => {
      const status = row?.status || row?.payment_status || row?.role || "record";
      statusMap.set(status, (statusMap.get(status) || 0) + 1);
    });
    const statusData = Array.from(statusMap.entries()).map(([name, count]) => ({ 
      name: titleize(name), 
      count,
      fill: CHART_COLORS[statusMap.size % CHART_COLORS.length]
    }));

    // Revenue trend from API only - no mock data
    const trendData = activeReport.charts?.trend || [];

    return { statusData, trendData };
  }, [activeReport]);

  // Render enhanced charts
  const renderCharts = () => (
    <>
      <ChartContainer title="Status Breakdown" subtitle="Distribution by current status">
        {enhancedCharts.statusData.length === 0 ? (
          <div className="reports-empty-mini">
            <FontAwesomeIcon icon={faChartLine} />
            <p>No status data available</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={enhancedCharts.statusData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                {enhancedCharts.statusData.map((item, index) => (
                  <Cell key={item.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartContainer>

      <ChartContainer title="Revenue Trend" subtitle="Daily revenue over time">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={enhancedCharts.trendData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => formatCurrency(value)} />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="revenue" 
              stroke={CHART_COLORS[0]} 
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              name="Revenue"
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
    </>
  );

  // Custom filter options per section
  const getCustomFilters = () => {
    switch (activeSection) {
      case 'orders':
        return [
          {
            key: 'payment_method',
            label: 'Payment Method',
            dataKey: 'payment_method',
            options: [
              { value: 'cash', label: 'Cash' },
              { value: 'card', label: 'Card' },
              { value: 'gcash', label: 'GCash' },
              { value: 'maya', label: 'Maya' },
            ],
          },
        ];
      case 'inventory':
        return [
          {
            key: 'category',
            label: 'Category',
            dataKey: 'category',
            options: [
              { value: 'food', label: 'Food' },
              { value: 'toys', label: 'Toys' },
              { value: 'medicine', label: 'Medicine' },
              { value: 'grooming', label: 'Grooming' },
            ],
          },
        ];
      default:
        return [];
    }
  };

  // Fetch data function for UnifiedReportEngine
  const fetchReportData = useCallback(async (filters) => {
    const config = activeConfig;
    const params = new URLSearchParams();
    
    if (filters.startDate) params.set("from", filters.startDate);
    if (filters.endDate) params.set("to", filters.endDate);
    if (filters.status && filters.status !== "all") params.set("status", filters.status);
    if (filters.payment_status && filters.payment_status !== "all") params.set("payment_status", filters.payment_status);
    
    // Add custom filters
    getCustomFilters().forEach((cf) => {
      if (filters[cf.key] && filters[cf.key] !== 'all') {
        params.set(cf.key, filters[cf.key]);
      }
    });

    const query = params.toString();
    const endpoint = query ? `${config.endpoint}?${query}` : config.endpoint;
    
    const response = await apiRequest(endpoint);
    const normalized = normalizeReportResponse(response, config.tableKeys);
    
    setReports((prev) => ({ ...prev, [activeSection]: normalized }));
    if (activeSection === "executive") {
      setOverview(normalized);
    }
    
    return normalized.table || [];
  }, [activeSection, activeConfig]);

  // Status options based on section
  const getStatusOptions = () => {
    const baseOptions = ["pending", "approved", "scheduled", "completed", "paid", "rejected", "cancelled"];
    if (activeSection === 'inventory') {
      return ['in_stock', 'low_stock', 'out_of_stock'];
    }
    return baseOptions;
  };

  // Render advanced component or standard report
  const renderAdvancedContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return <ExecutiveDashboard data={overview || activeReport} />;
      case 'staff_perf':
        return <StaffPerformance data={activeReport} />;
      case 'api_health':
        return <ApiHealthCheck />;
      default:
        return null;
    }
  };

  return (
    <div className="admin-reports-wrapper">
      {/* Section Navigation */}
      <nav className="admin-reports-nav" aria-label="Report sections">
        {SECTION_CONFIG.map((section) => (
          <button
            key={section.key}
            type="button"
            className={`admin-nav-tab ${activeSection === section.key ? "active" : ""} ${section.isAdvanced ? 'advanced' : ''} ${section.isUtility ? 'utility' : ''}`}
            onClick={() => setActiveSection(section.key)}
          >
            <FontAwesomeIcon icon={section.icon} />
            {section.label}
          </button>
        ))}
      </nav>

      {/* Executive KPI Cards - Always visible */}
      <SummaryCards cards={headerKpis} layout="grid" />

      {/* Main Report Content */}
      {activeConfig.isAdvanced ? (
        <div className="advanced-report-content">
          <ReportErrorBoundary onRetry={() => fetchReport(activeSection)}>
            <Suspense fallback={<AdvancedReportLoading />}>
              {renderAdvancedContent()}
            </Suspense>
          </ReportErrorBoundary>
        </div>
      ) : (
        <UnifiedReportEngine
          title={activeConfig.label}
          subtitle={`${activeConfig.tableTitle} with filters, analytics, and export options`}
          icon={activeConfig.icon}
          fetchData={fetchReportData}
          data={safeArray(activeReport.table)}
          rawData={activeReport}
          columns={buildColumns(safeArray(activeReport.table))}
          summaryCards={[]}
          charts={renderCharts()}
          statusOptions={getStatusOptions()}
          customFilters={getCustomFilters()}
          exportFilename={`admin-${activeSection}-report`}
          exportTitle={activeConfig.label}
          tablePageSize={12}
          tableEmptyMessage={`No ${activeConfig.label.toLowerCase()} records found for the selected filters.`}
          enableSavedFilters={true}
          refreshInterval={30000}
        />
      )}
    </div>
  );
};

export default AdminReports;
