import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowTrendUp,
  faBox,
  faChartPie,
  faClipboardList,
  faClock,
  faDownload,
  faEye,
  faFileCsv,
  faFileExcel,
  faFilePdf,
  faReceipt,
  faRotateRight,
  faShoppingCart,
  faSpinner,
  faTimes,
  faTruck,
  faUserTie,
  faStethoscope,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import StandardReportLayout from "../shared/StandardReportLayout";
import StandardSummaryCards from "../shared/StandardSummaryCards";
import StandardTable from "../shared/StandardTable";
import {
  exportToCSV,
  exportToPDF,
  exportToExcel,
  getDateRangePreset,
} from "../../utils/reportExport";
import { useRealTimeSync } from "../../hooks/useRealTimeSync";
import "./AdminReports.css";

const icons = {
  payments: faReceipt,
  orders: faShoppingCart,
  services: faClipboardList,
  logistics: faTruck,
  inventory: faBox,
  manager: faUserTie,
  veterinary: faStethoscope,
};

const safeArray = (value, dataKey) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.[dataKey])) return value[dataKey];
  if (Array.isArray(value?.data?.[dataKey])) return value.data[dataKey];
  if (Array.isArray(value?.data?.data?.[dataKey])) return value.data.data[dataKey];
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.records)) return value.records;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.results)) return value.results;
  return [];
};

const AdminLiveReport = ({
  title,
  subtitle,
  endpoint,
  dataKey,
  summaryBuilder,
  columns,
  exportName,
  icon = "orders",
  statusOptions = [],
  searchPlaceholder = "Search report...",
}) => {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRow, setSelectedRow] = useState(null);

  useEffect(() => {
    const preset = getDateRangePreset("month");
    setStartDate(preset.startDate);
    setEndDate(preset.endDate);
  }, []);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();

    if (startDate) {
      params.append("from", startDate);
      params.append("start_date", startDate);
    }

    if (endDate) {
      params.append("to", endDate);
      params.append("end_date", endDate);
    }

    if (statusFilter !== "all") params.append("status", statusFilter);
    if (searchTerm.trim()) params.append("search", searchTerm.trim());

    return params.toString();
  }, [startDate, endDate, statusFilter, searchTerm]);

  const normalizeResponse = (response) => {
    const data = response?.data?.data || response?.data || response || {};

    return {
      rows: safeArray(data, dataKey),
      summary: data.summary || response?.summary || {},
    };
  };

  const fetchData = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const query = buildQuery();
        const response = await apiRequest(query ? `${endpoint}?${query}` : endpoint);
        const normalized = normalizeResponse(response);

        setRows(normalized.rows);
        setSummary(normalized.summary);
        setLastUpdated(new Date().toLocaleString("en-PH"));
      } catch (err) {
        console.error(`${title} fetch error:`, err);
        setError(err.message || `Failed to load ${title.toLowerCase()}.`);
        setRows([]);
        setSummary({});
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [endpoint, dataKey, title, buildQuery]
  );

  useRealTimeSync(
    () => fetchData({ silent: true }),
    [startDate, endDate, statusFilter, searchTerm],
    30000
  );

  const filteredRows = useMemo(() => rows, [rows]);

  const cards = useMemo(() => {
    return summaryBuilder(summary).map((card) => ({
      ...card,
      value: card.currency ? formatCurrency(card.value || 0) : card.value ?? 0,
    }));
  }, [summary, summaryBuilder]);

  const statusBreakdown = useMemo(() => {
    const map = new Map();

    filteredRows.forEach((row) => {
      const status = row.status || row.payment_status || row.order_status || "unknown";
      map.set(status, (map.get(status) || 0) + 1);
    });

    return Array.from(map.entries()).map(([status, count]) => ({
      status,
      count,
    }));
  }, [filteredRows]);

  const exportColumns = columns.filter((column) => column.key !== "actions");

  const handleDateChange = (key, value) => {
    if (key === "startDate") setStartDate(value);
    if (key === "endDate") setEndDate(value);
  };

  const clearFilters = () => {
    const preset = getDateRangePreset("month");

    setSearchTerm("");
    setStatusFilter("all");
    setStartDate(preset.startDate);
    setEndDate(preset.endDate);
  };

  const formatCellValue = (key, value) => {
    const column = columns.find((item) => item.key === key);

    if (value === null || value === undefined || value === "") return "N/A";
    if (column?.format === "currency") return formatCurrency(value);
    if (column?.format === "datetime") return new Date(value).toLocaleString("en-PH");
    if (column?.format === "date") return new Date(value).toLocaleDateString("en-PH");

    if (typeof value === "object") return JSON.stringify(value);

    return String(value);
  };

  return (
    <StandardReportLayout
      title={title}
      subtitle={subtitle}
      icon={icons[icon]}
      loading={loading}
      error={error}
      onRefresh={() => fetchData({ silent: true })}
      lastUpdated={lastUpdated || new Date().toLocaleTimeString()}
    >
      <div className="reports-content live-report-content">
        <div className="live-report-toolbar">
          <div>
            <span className="reports-eyebrow">
              <FontAwesomeIcon icon={icons[icon]} />
              Live Report
            </span>
            <h2>{title}</h2>
            <p>{filteredRows.length} record(s) found from the current filters.</p>
          </div>

          <button
            type="button"
            className={`refresh-report-btn ${refreshing ? "refreshing" : ""}`}
            onClick={() => fetchData({ silent: true })}
            disabled={refreshing}
          >
            <FontAwesomeIcon icon={refreshing ? faSpinner : faRotateRight} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <StandardSummaryCards cards={cards} />

        <section className="live-report-insights">
          <article className="premium-report-panel">
            <div className="report-panel-heading">
              <div>
                <h3>
                  <FontAwesomeIcon icon={faChartPie} />
                  Status Distribution
                </h3>
                <p>Quick count by current status values.</p>
              </div>
            </div>

            {statusBreakdown.length === 0 ? (
              <div className="reports-empty-mini">
                <FontAwesomeIcon icon={faClipboardList} />
                <p>No status data available.</p>
              </div>
            ) : (
              <div className="status-breakdown-list">
                {statusBreakdown.map((item) => (
                  <div key={item.status}>
                    <span>{String(item.status).replace(/_/g, " ")}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="premium-report-panel report-health-panel">
            <div className="report-panel-heading">
              <div>
                <h3>
                  <FontAwesomeIcon icon={faArrowTrendUp} />
                  Report Snapshot
                </h3>
                <p>Useful indicators for the selected report period.</p>
              </div>
            </div>

            <div className="report-health-list">
              <div>
                <span>Total Rows</span>
                <strong>{filteredRows.length}</strong>
              </div>
              <div>
                <span>Statuses</span>
                <strong>{statusBreakdown.length}</strong>
              </div>
              <div>
                <span>Endpoint</span>
                <strong>{endpoint}</strong>
              </div>
              <div>
                <span>Sync</span>
                <strong>30s</strong>
              </div>
            </div>
          </article>
        </section>

        <section className="premium-report-panel data-table-section">
          <div className="report-panel-heading">
            <div>
              <h3>{title} Details</h3>
              <p>Open any row to inspect its complete record fields.</p>
            </div>

            <div className="table-action-group">
              <button type="button" onClick={() => exportToCSV(filteredRows, exportColumns, exportName)}>
                <FontAwesomeIcon icon={faFileCsv} />
                CSV
              </button>
              <button type="button" onClick={() => exportToExcel(filteredRows, exportColumns, exportName)}>
                <FontAwesomeIcon icon={faFileExcel} />
                Excel
              </button>
              <button type="button" onClick={() => exportToPDF(filteredRows, exportColumns, title, exportName)}>
                <FontAwesomeIcon icon={faFilePdf} />
                PDF
              </button>
            </div>
          </div>

          <StandardTable
            columns={[
              ...columns,
              {
                key: "actions",
                label: "Details",
                render: (_, row) => (
                  <button
                    className="report-row-action"
                    type="button"
                    onClick={() => setSelectedRow(row)}
                  >
                    <FontAwesomeIcon icon={faEye} />
                    View
                  </button>
                ),
              },
            ]}
            data={filteredRows}
            emptyMessage={`No ${title.toLowerCase()} found`}
          />
        </section>

        {selectedRow && (
          <div className="modal-overlay report-modal-overlay" onClick={() => setSelectedRow(null)}>
            <div className="modal-content report-detail-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <span className="reports-eyebrow">
                    <FontAwesomeIcon icon={faClipboardList} />
                    Record Details
                  </span>
                  <h2>{title} Detail</h2>
                </div>

                <button
                  className="modal-close"
                  type="button"
                  onClick={() => setSelectedRow(null)}
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>

              <div className="modal-body">
                <div className="info-grid">
                  {Object.entries(selectedRow).map(([key, value]) => (
                    <div className="info-item" key={key}>
                      <label>{key.replace(/_/g, " ")}</label>
                      <span>{formatCellValue(key, value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-footer">
                <button
                  className="refresh-report-btn"
                  type="button"
                  onClick={() => setSelectedRow(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </StandardReportLayout>
  );
};

export default AdminLiveReport;
