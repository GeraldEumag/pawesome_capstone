import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import DatePickerInput from "../../components/shared/DatePickerInput";
import {
  faArrowDown,
  faArrowUp,
  faCalendarAlt,
  faCalendarCheck,
  faChartBar,
  faChartLine,
  faClipboardList,
  faExclamationTriangle,
  faEye,
  faFileCsv,
  faFileExcel,
  faFilePdf,
  faFilter,
  faMoneyBillWave,
  faPaw,
  faPrint,
  faRotateRight,
  faSearch,
  faSpinner,
  faStethoscope,
  faTable,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import {
  exportToCSV,
  exportToPDF,
  exportToExcel,
  getDateRangePreset,
} from "../../utils/reportExport";
import { safeArray } from "../../utils/normalizeList";
import "./VetReports.css";

const CHART_COLORS = ["#ff5f93", "#ff8db5", "#ffc8dd", "#fb7185", "#f59e0b", "#10b981"];

const getInitialDateRange = () => {
  try {
    const preset = getDateRangePreset("month");
    return {
      startDate: preset?.startDate || "",
      endDate: preset?.endDate || "",
    };
  } catch {
    return {
      startDate: "",
      endDate: "",
    };
  }
};

const emptyReports = {
  monthly_revenue: 0,
  monthly_completed: 0,
  period: "Current Month",
  service_breakdown: [],
  records: [],
};

const VetReports = () => {
  const initialRange = getInitialDateRange();

  const [reports, setReports] = useState(emptyReports);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ type: "", text: "" });
  const [lastUpdated, setLastUpdated] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("all");

  const [sortConfig, setSortConfig] = useState({
    key: "revenue",
    direction: "desc",
  });
  const [selectedService, setSelectedService] = useState(null);

  const showToast = (type, text) => {
    setToast({ type, text });

    window.clearTimeout(window.vetReportsToastTimer);
    window.vetReportsToastTimer = window.setTimeout(() => {
      setToast({ type: "", text: "" });
    }, 3500);
  };

  const formatNumber = (value) =>
    new Intl.NumberFormat("en-PH").format(Number(value || 0));

  const formatDate = (value) => {
    if (!value) return "No date";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const normalizeStatus = (value) =>
    String(value || "completed").toLowerCase().replace(/\s+/g, "_");

  const normalizeServiceName = (item) =>
    item?.service?.name ||
    item?.service_name ||
    item?.serviceType ||
    item?.service_type ||
    item?.name ||
    item?.title ||
    "Unknown Service";

  const normalizeRecord = (record, index) => {
    const serviceName = normalizeServiceName(record);
    const amount = Number(
      record?.revenue ||
        record?.amount ||
        record?.price ||
        record?.total_amount ||
        record?.paid_amount ||
        0
    );

    return {
      id: record?.id || index + 1,
      date:
        record?.date ||
        record?.visit_date ||
        record?.appointment_date ||
        record?.scheduled_at ||
        record?.created_at ||
        "",
      customer:
        record?.customer?.name ||
        record?.customer_name ||
        record?.owner_name ||
        record?.client_name ||
        "Customer",
      pet:
        record?.pet?.name ||
        record?.pet_name ||
        record?.patient_name ||
        "Pet",
      serviceName,
      status: normalizeStatus(record?.status),
      revenue: amount,
      veterinarian:
        record?.veterinarian?.name ||
        record?.vet?.name ||
        record?.vet_name ||
        record?.doctor ||
        record?.handled_by ||
        "Veterinary Staff",
      notes: record?.notes || record?.remarks || record?.diagnosis || "",
      raw: record,
    };
  };

  const buildServicesFromRecords = (records) => {
    const serviceMap = new Map();

    records.forEach((record) => {
      const key = record.serviceName || "Unknown Service";
      const existing =
        serviceMap.get(key) ||
        {
          id: key,
          service: { name: key },
          serviceName: key,
          count: 0,
          revenue: 0,
          average_revenue: 0,
          status: "completed",
          date: record.date || "",
        };

      existing.count += 1;
      existing.revenue += Number(record.revenue || 0);
      existing.average_revenue =
        existing.count > 0 ? existing.revenue / existing.count : 0;

      serviceMap.set(key, existing);
    });

    return Array.from(serviceMap.values());
  };

  const normalizeReportData = (response) => {
    const reportData = Array.isArray(response)
      ? response[0] || {}
      : response?.data?.summary
      ? response.data
      : response?.data || response || {};

    const summary = reportData.summary || {};
    const records = safeArray(
      reportData.records ||
        reportData.appointments ||
        reportData.recent_appointments ||
        reportData.completed_appointments ||
        reportData.appointment_records
    ).map(normalizeRecord);

    const serviceSource = safeArray(
      reportData.service_breakdown ||
        reportData.services ||
        reportData.service_performance ||
        reportData.breakdown
    );

    const normalizedServices = safeArray(serviceSource).map((item, index) => {
      const serviceName = normalizeServiceName(item);
      const count = Number(item?.count || item?.appointments || item?.total || item?.completed || 0);
      const revenue = Number(item?.revenue || item?.amount || item?.total_revenue || item?.sales || 0);

      return {
        id: item?.id || serviceName || index + 1,
        service: {
          name: serviceName,
        },
        serviceName,
        count,
        revenue,
        average_revenue: count > 0 ? revenue / count : 0,
        status: normalizeStatus(item?.status),
        date: item?.date || item?.created_at || "",
        raw: item,
      };
    });

    const finalServices =
      normalizedServices.length > 0 ? normalizedServices : buildServicesFromRecords(records);

    const computedRevenue = finalServices.reduce(
      (total, item) => total + Number(item.revenue || 0),
      0
    );

    const computedCompleted = finalServices.reduce(
      (total, item) => total + Number(item.count || 0),
      0
    );

    return {
      monthly_revenue: Number(
        reportData.monthly_revenue ||
          summary.monthly_revenue ||
          summary.total_revenue ||
          reportData.total_revenue ||
          reportData.revenue ||
          computedRevenue ||
          0
      ),
      monthly_completed: Number(
        reportData.monthly_completed ||
          summary.monthly_completed ||
          summary.completed_appointments ||
          reportData.completed_appointments ||
          reportData.total_completed ||
          computedCompleted ||
          0
      ),
      period: reportData.period || summary.period || reportData.month || "Current Month",
      service_breakdown: finalServices,
      records,
    };
  };

  const fetchVetReports = async (options = {}) => {
    const {
      silent = false,
      nextStartDate = startDate,
      nextEndDate = endDate,
      nextStatusFilter = statusFilter,
    } = options;

    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const params = new URLSearchParams();

      if (nextStartDate) params.append("start_date", nextStartDate);
      if (nextEndDate) params.append("end_date", nextEndDate);
      if (nextStatusFilter && nextStatusFilter !== "all") {
        params.append("status", nextStatusFilter);
      }

      const query = params.toString();
      const endpoint = query
        ? `/veterinary/reports?${query}`
        : "/veterinary/reports";

      const result = await apiRequest(endpoint);
      const data = normalizeReportData(result);

      setReports(data);
      setLastUpdated(new Date().toLocaleString("en-PH"));
    } catch (err) {
      console.error("Failed to fetch veterinary reports:", err);
      setError(err.message || "Failed to load live veterinary report data.");
      setReports(emptyReports);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchVetReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const serviceOptions = useMemo(() => {
    const serviceNames = [
      ...(reports?.service_breakdown || []).map((item) => item.serviceName),
      ...(reports?.records || []).map((item) => item.serviceName),
    ]
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index);

    return serviceNames.sort();
  }, [reports]);

  const filteredServices = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return (reports?.service_breakdown || [])
      .filter((item) => {
        const serviceName = item.serviceName || item.service?.name || "Unknown Service";

        const matchesSearch =
          !keyword ||
          [
            serviceName,
            item.status,
            item.count,
            item.revenue,
            item.average_revenue,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(keyword);

        const matchesService =
          serviceTypeFilter === "all" ||
          serviceName.toLowerCase() === serviceTypeFilter.toLowerCase();

        return matchesSearch && matchesService;
      })
      .map((item) => ({
        ...item,
        average_revenue:
          Number(item.count || 0) > 0
            ? Number(item.revenue || 0) / Number(item.count || 1)
            : 0,
      }));
  }, [reports, searchTerm, serviceTypeFilter]);

  const filteredRecords = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return (reports?.records || []).filter((record) => {
      const recordDate = record.date ? new Date(record.date) : null;
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      const matchesDate =
        !recordDate ||
        Number.isNaN(recordDate.getTime()) ||
        ((!start || recordDate >= start) && (!end || recordDate <= end));

      const matchesStatus =
        statusFilter === "all" || record.status === statusFilter;

      const matchesService =
        serviceTypeFilter === "all" ||
        record.serviceName.toLowerCase() === serviceTypeFilter.toLowerCase();

      const matchesSearch =
        !keyword ||
        [
          record.customer,
          record.pet,
          record.serviceName,
          record.status,
          record.veterinarian,
          record.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(keyword);

      return matchesDate && matchesStatus && matchesService && matchesSearch;
    });
  }, [reports, searchTerm, statusFilter, serviceTypeFilter, startDate, endDate]);

  const sortedServices = useMemo(() => {
    const list = [...filteredServices];

    list.sort((a, b) => {
      const key = sortConfig.key;
      const direction = sortConfig.direction === "asc" ? 1 : -1;

      const aValue =
        key === "serviceName"
          ? a.serviceName || a.service?.name || ""
          : Number(a[key] || 0);

      const bValue =
        key === "serviceName"
          ? b.serviceName || b.service?.name || ""
          : Number(b[key] || 0);

      if (typeof aValue === "string") {
        return aValue.localeCompare(bValue) * direction;
      }

      return (aValue - bValue) * direction;
    });

    return list;
  }, [filteredServices, sortConfig]);

  const summary = useMemo(() => {
    const revenue = Number(reports?.monthly_revenue || 0);
    const completed = Number(reports?.monthly_completed || 0);
    const services = reports?.service_breakdown?.length || 0;
    const averageServiceRevenue = services > 0 ? revenue / services : 0;
    const highestService = [...(reports?.service_breakdown || [])].sort(
      (a, b) => Number(b.revenue || 0) - Number(a.revenue || 0)
    )[0];

    return {
      revenue,
      completed,
      services,
      averageServiceRevenue,
      highestService,
    };
  }, [reports]);

  const chartData = useMemo(
    () =>
      sortedServices.slice(0, 10).map((item) => ({
        name: item.serviceName || item.service?.name || "Service",
        revenue: Number(item.revenue || 0),
        appointments: Number(item.count || 0),
      })),
    [sortedServices]
  );

  const pieData = useMemo(
    () =>
      sortedServices
        .filter((item) => Number(item.count || 0) > 0)
        .slice(0, 6)
        .map((item) => ({
          name: item.serviceName || item.service?.name || "Service",
          value: Number(item.count || 0),
        })),
    [sortedServices]
  );

  const maxRevenue = useMemo(() => {
    return Math.max(...sortedServices.map((item) => Number(item.revenue || 0)), 1);
  }, [sortedServices]);

  const exportRows = useMemo(
    () =>
      sortedServices.map((item) => ({
        service_name: item.serviceName || item.service?.name || "Unknown Service",
        appointments: Number(item.count || 0),
        revenue: Number(item.revenue || 0),
        average_revenue: Number(item.average_revenue || 0),
        period: reports?.period || "Current Month",
      })),
    [sortedServices, reports]
  );

  const exportColumns = [
    { key: "service_name", label: "Service Name" },
    { key: "appointments", label: "Appointments" },
    { key: "revenue", label: "Revenue", format: "currency" },
    { key: "average_revenue", label: "Average Revenue", format: "currency" },
    { key: "period", label: "Period" },
  ];

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction:
        prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  };

  const handleClearFilters = () => {
    const resetRange = getInitialDateRange();

    setSearchTerm("");
    setStatusFilter("all");
    setServiceTypeFilter("all");
    setStartDate(resetRange.startDate);
    setEndDate(resetRange.endDate);

    fetchVetReports({
      nextStartDate: resetRange.startDate,
      nextEndDate: resetRange.endDate,
      nextStatusFilter: "all",
    });

    showToast("success", "Filters cleared.");
  };

  const handleApplyFilters = () => {
    fetchVetReports();
    showToast("success", "Filters applied.");
  };

  const handleRefresh = () => {
    fetchVetReports({ silent: true });
  };

  const handleExport = (type) => {
    if (exportRows.length === 0) {
      showToast("error", "No report data available to export.");
      return;
    }

    try {
      if (type === "csv") {
        exportToCSV(exportRows, exportColumns, "veterinary-service-report");
      }

      if (type === "pdf") {
        exportToPDF(
          exportRows,
          exportColumns,
          "Veterinary Service Report",
          "veterinary-service-report"
        );
      }

      if (type === "excel") {
        exportToExcel(exportRows, exportColumns, "veterinary-service-report");
      }

      showToast("success", `Report exported as ${type.toUpperCase()}.`);
    } catch (err) {
      console.error("Export failed:", err);
      showToast("error", `Failed to export ${type.toUpperCase()} report.`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) return null;

    return (
      <FontAwesomeIcon
        icon={sortConfig.direction === "asc" ? faArrowUp : faArrowDown}
      />
    );
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;

    return (
      <div className="vet-chart-tooltip">
        <strong>{label}</strong>
        {payload.map((item) => (
          <p key={item.dataKey}>
            {item.name}:{" "}
            {item.dataKey === "revenue"
              ? formatCurrency(item.value || 0)
              : formatNumber(item.value || 0)}
          </p>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <section className="app-content vet-reports">
        <div className="premium-card vet-loading-state">
          <FontAwesomeIcon icon={faSpinner} className="spin-animation" />
          <span>Loading veterinary reports...</span>
        </div>
      </section>
    );
  }

  return (
    <section className="app-content vet-reports">
      {toast.text && (
        <div className={`vet-reports-toast ${toast.type}`}>
          <FontAwesomeIcon
            icon={toast.type === "success" ? faStethoscope : faExclamationTriangle}
          />
          <span>{toast.text}</span>
        </div>
      )}

      <div className="premium-card vet-reports-hero">
        <div className="vet-reports-hero-copy">
          <span className="vet-reports-eyebrow">
            <FontAwesomeIcon icon={faChartLine} />
            Veterinary Analytics
          </span>

          <h2 className="premium-title">
            <FontAwesomeIcon icon={faStethoscope} />
            Veterinary Reports
          </h2>

          <p className="premium-muted">
            Monitor veterinary service revenue, completed appointments, service demand,
            and patient activity using live report data.
          </p>
        </div>

        <div className="vet-reports-hero-actions">
          <span className="vet-data-source-badge live">
            Live Data
          </span>

          <button
            className={`vet-reports-refresh-btn ${refreshing ? "refreshing" : ""}`}
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <FontAwesomeIcon icon={faRotateRight} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="premium-card vet-error-banner">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>{error}</span>

          <button type="button" onClick={() => setError("")}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
      )}

      <div className="premium-card vet-report-filters">
        <div className="vet-report-search">
          <FontAwesomeIcon icon={faSearch} />
          <input
            type="text"
            placeholder="Search service, pet, customer, veterinarian, notes..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm("")}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>

        <div className="vet-filter-grid">
          <label>
            Start Date
            <DatePickerInput
              selected={startDate ? new Date(startDate) : null}
              onChange={(date) => setStartDate(date ? date.toISOString().split("T")[0] : "")}
              placeholderText="From..."
            />
          </label>

          <label>
            End Date
            <DatePickerInput
              selected={endDate ? new Date(endDate) : null}
              onChange={(date) => setEndDate(date ? date.toISOString().split("T")[0] : "")}
              placeholderText="To..."
            />
          </label>

          <label>
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="scheduled">Scheduled</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>

          <label>
            Service
            <select
              value={serviceTypeFilter}
              onChange={(event) => setServiceTypeFilter(event.target.value)}
            >
              <option value="all">All Services</option>
              {serviceOptions.map((service) => (
                <option key={service} value={service}>
                  {service}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="vet-filter-actions">
          <button className="vet-filter-btn primary" type="button" onClick={handleApplyFilters}>
            <FontAwesomeIcon icon={faFilter} />
            Apply Filters
          </button>

          <button className="vet-filter-btn ghost" type="button" onClick={handleClearFilters}>
            <FontAwesomeIcon icon={faTimes} />
            Clear
          </button>
        </div>
      </div>

      <div className="vet-report-stats">
        <article className="premium-card vet-report-stat-card">
          <span>
            <FontAwesomeIcon icon={faMoneyBillWave} />
          </span>
          <div>
            <h3>{formatCurrency(summary.revenue)}</h3>
            <p>Monthly Revenue</p>
          </div>
        </article>

        <article className="premium-card vet-report-stat-card">
          <span>
            <FontAwesomeIcon icon={faCalendarCheck} />
          </span>
          <div>
            <h3>{formatNumber(summary.completed)}</h3>
            <p>Completed Appointments</p>
          </div>
        </article>

        <article className="premium-card vet-report-stat-card">
          <span>
            <FontAwesomeIcon icon={faStethoscope} />
          </span>
          <div>
            <h3>{formatNumber(summary.services)}</h3>
            <p>Active Services</p>
          </div>
        </article>

        <article className="premium-card vet-report-stat-card">
          <span>
            <FontAwesomeIcon icon={faChartBar} />
          </span>
          <div>
            <h3>{formatCurrency(summary.averageServiceRevenue)}</h3>
            <p>Avg. Revenue / Service</p>
          </div>
        </article>
      </div>

      <div className="premium-card vet-financial-panel">
        <div className="vet-panel-header">
          <div>
            <h3>Financial Overview</h3>
            <p>Revenue and appointment summary for {reports?.period || "current period"}.</p>
          </div>

          <span className="vet-period-badge">
            <FontAwesomeIcon icon={faCalendarAlt} />
            {reports?.period || "Current Month"}
          </span>
        </div>

        <div className="vet-financial-summary">
          <div>
            <small>Total Revenue</small>
            <strong>{formatCurrency(summary.revenue)}</strong>
          </div>

          <div>
            <small>Highest Service</small>
            <strong>
              {summary.highestService?.serviceName ||
                summary.highestService?.service?.name ||
                "No data"}
            </strong>
          </div>

          <div>
            <small>Last Updated</small>
            <strong>{lastUpdated || "Not available"}</strong>
          </div>
        </div>
      </div>

      <div className="vet-report-chart-grid">
        <div className="premium-card vet-chart-panel">
          <div className="vet-panel-header">
            <div>
              <h3>Service Revenue Breakdown</h3>
              <p>Top services ranked by generated revenue.</p>
            </div>
          </div>

          <div className="vet-chart-box">
            {chartData.length === 0 ? (
              <div className="vet-chart-empty">
                <FontAwesomeIcon icon={faChartBar} />
                <p>No revenue chart data available.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue" radius={[10, 10, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`bar-${entry.name}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="premium-card vet-chart-panel">
          <div className="vet-panel-header">
            <div>
              <h3>Appointment Distribution</h3>
              <p>Completed appointment count per service.</p>
            </div>
          </div>

          <div className="vet-chart-box">
            {pieData.length === 0 ? (
              <div className="vet-chart-empty">
                <FontAwesomeIcon icon={faChartLine} />
                <p>No appointment distribution data available.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={105}
                    paddingAngle={4}
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`pie-${entry.name}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="premium-card vet-services-panel">
        <div className="vet-panel-header">
          <div>
            <h3>Service Performance Cards</h3>
            <p>Quick view of appointments, revenue, and service contribution.</p>
          </div>
        </div>

        {sortedServices.length === 0 ? (
          <div className="vet-empty-state">
            <FontAwesomeIcon icon={faStethoscope} />
            <h3>No services found</h3>
            <p>Try adjusting your filters or check if live data exists.</p>
          </div>
        ) : (
          <div className="vet-services-grid">
            {sortedServices.slice(0, 8).map((item) => {
              const serviceName = item.serviceName || item.service?.name || "Unknown Service";
              const progress = Math.min((Number(item.revenue || 0) / maxRevenue) * 100, 100);

              return (
                <article className="premium-card vet-service-card" key={item.id || serviceName}>
                  <div className="vet-service-header">
                    <span>
                      <FontAwesomeIcon icon={faPaw} />
                    </span>

                    <div>
                      <strong>{serviceName}</strong>
                      <p>{formatNumber(item.count)} appointment(s)</p>
                    </div>
                  </div>

                  <div className="vet-service-stats">
                    <div>
                      <strong>{formatCurrency(item.revenue)}</strong>
                      <p>Revenue</p>
                    </div>

                    <div>
                      <strong>{formatCurrency(item.average_revenue)}</strong>
                      <p>Average</p>
                    </div>
                  </div>

                  <div className="vet-service-progress">
                    <span style={{ width: `${progress}%` }} />
                  </div>

                  <button
                    className="vet-table-action view"
                    type="button"
                    onClick={() => setSelectedService(item)}
                  >
                    <FontAwesomeIcon icon={faEye} />
                    View Details
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="premium-card vet-table-panel">
        <div className="vet-panel-header">
          <div>
            <h3>
              <FontAwesomeIcon icon={faTable} />
              Service Performance Table
            </h3>
            <p>Sortable report table for export and review.</p>
          </div>

          <div className="vet-export-actions">
            <button type="button" onClick={() => handleExport("csv")}>
              <FontAwesomeIcon icon={faFileCsv} />
              CSV
            </button>

            <button type="button" onClick={() => handleExport("excel")}>
              <FontAwesomeIcon icon={faFileExcel} />
              Excel
            </button>

            <button type="button" onClick={() => handleExport("pdf")}>
              <FontAwesomeIcon icon={faFilePdf} />
              PDF
            </button>

            <button type="button" onClick={handlePrint}>
              <FontAwesomeIcon icon={faPrint} />
              Print
            </button>
          </div>
        </div>

        <div className="vet-table-scroll">
          <table className="vet-report-table">
            <thead>
              <tr>
                <th>
                  <button type="button" onClick={() => handleSort("serviceName")}>
                    Service Name <SortIcon columnKey="serviceName" />
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => handleSort("count")}>
                    Appointments <SortIcon columnKey="count" />
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => handleSort("revenue")}>
                    Revenue <SortIcon columnKey="revenue" />
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => handleSort("average_revenue")}>
                    Average <SortIcon columnKey="average_revenue" />
                  </button>
                </th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {sortedServices.length === 0 ? (
                <tr>
                  <td colSpan="5">
                    <div className="vet-table-empty">
                      <FontAwesomeIcon icon={faSearch} />
                      <strong>No service records found</strong>
                      <span>Try changing search or filters.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedServices.map((item) => {
                  const serviceName = item.serviceName || item.service?.name || "Unknown Service";

                  return (
                    <tr key={`table-${item.id || serviceName}`}>
                      <td>
                        <strong>{serviceName}</strong>
                      </td>
                      <td>{formatNumber(item.count)}</td>
                      <td>{formatCurrency(item.revenue)}</td>
                      <td>{formatCurrency(item.average_revenue)}</td>
                      <td>
                        <button
                          className="vet-table-action"
                          type="button"
                          onClick={() => setSelectedService(item)}
                        >
                          <FontAwesomeIcon icon={faEye} />
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="premium-card vet-activity-panel">
        <div className="vet-panel-header">
          <div>
            <h3>Recent Veterinary Activity</h3>
            <p>Appointment or medical-record activity returned by the backend.</p>
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="vet-empty-state compact">
            <FontAwesomeIcon icon={faClipboardList} />
            <h3>No recent activity records</h3>
            <p>The backend may not be returning appointment records yet.</p>
          </div>
        ) : (
          <div className="vet-activity-list">
            {filteredRecords.slice(0, 8).map((record) => (
              <article className="vet-activity-item" key={record.id}>
                <div className="vet-activity-icon">
                  <FontAwesomeIcon icon={faStethoscope} />
                </div>

                <div>
                  <h4>{record.serviceName}</h4>
                  <p>
                    {record.pet} • {record.customer} • {formatDate(record.date)}
                  </p>
                  <small>Handled by {record.veterinarian}</small>
                </div>

                <span className={`vet-status-pill ${record.status}`}>
                  {record.status.replace(/_/g, " ")}
                </span>
              </article>
            ))}
          </div>
        )}
      </div>

      {selectedService && (
        <div className="vet-report-modal-overlay" onClick={() => setSelectedService(null)}>
          <div className="vet-report-modal" onClick={(event) => event.stopPropagation()}>
            <div className="vet-report-modal-header">
              <div>
                <span className="vet-reports-eyebrow">
                  <FontAwesomeIcon icon={faStethoscope} />
                  Service Details
                </span>
                <h3>
                  {selectedService.serviceName ||
                    selectedService.service?.name ||
                    "Unknown Service"}
                </h3>
                <p>{reports?.period || "Current Period"}</p>
              </div>

              <button type="button" onClick={() => setSelectedService(null)}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="vet-report-modal-body">
              <div className="vet-detail-grid">
                <div>
                  <small>Appointments</small>
                  <strong>{formatNumber(selectedService.count)}</strong>
                </div>

                <div>
                  <small>Total Revenue</small>
                  <strong>{formatCurrency(selectedService.revenue)}</strong>
                </div>

                <div>
                  <small>Average Revenue</small>
                  <strong>{formatCurrency(selectedService.average_revenue)}</strong>
                </div>

                <div>
                  <small>Revenue Share</small>
                  <strong>
                    {summary.revenue > 0
                      ? `${((Number(selectedService.revenue || 0) / summary.revenue) * 100).toFixed(1)}%`
                      : "0%"}
                  </strong>
                </div>
              </div>

              <div className="vet-modal-note">
                <FontAwesomeIcon icon={faChartLine} />
                <p>
                  This detail view uses live report data returned by the veterinary reports
                  endpoint. For deeper drill-down per appointment, the backend should return
                  appointment-level records in the report response.
                </p>
              </div>
            </div>

            <div className="vet-report-modal-actions">
              <button type="button" onClick={() => setSelectedService(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default VetReports;