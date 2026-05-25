import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarCheck,
  faChartLine,
  faCheckCircle,
  faClock,
  faDownload,
  faEye,
  faInfoCircle,
  faMoneyBillWave,
  faReceipt,
  faRefresh,
  faSearch,
  faShoppingBag,
  faTimes,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import StandardReportLayout from "../shared/StandardReportLayout";
import StandardTable from "../shared/StandardTable";
import {
  exportToCSV,
  exportToPDF,
  exportToExcel,
  filterByDateRange,
  filterByStatus,
  getDateRangePreset,
} from "../../utils/reportExport";
import "./ReceptionistReports.css";

const CHART_COLORS = ["#ff5f93", "#ff8db5", "#ffc8dd", "#f59e0b", "#10b981", "#3b82f6"];

const getDefaultDateRange = () => {
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

const normalizeList = (payload, keys = []) => {
  if (Array.isArray(payload)) return payload;

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(payload?.data?.[key])) return payload.data[key];
    if (Array.isArray(payload?.[key]?.data)) return payload[key].data;
    if (Array.isArray(payload?.data?.[key]?.data)) return payload.data[key].data;
  }

  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.requests)) return payload.requests;
  if (Array.isArray(payload?.orders)) return payload.orders;

  return [];
};

const normalizeStatus = (value) =>
  String(value || "pending").toLowerCase().replace(/\s+/g, "_");

const formatLabel = (value) =>
  String(value || "N/A")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const toDateKey = (value) => {
  if (!value) return "";

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
};

const formatDateDisplay = (value) => {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const formatTimeDisplay = (value) => {
  if (!value) return "N/A";

  if (String(value).includes("AM") || String(value).includes("PM")) {
    return value;
  }

  if (String(value).includes(":") && !String(value).includes("T")) {
    const [hour, minute] = String(value).split(":");
    const date = new Date();
    date.setHours(Number(hour || 0), Number(minute || 0), 0, 0);

    return date.toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const getStatusClass = (status) => {
  const value = normalizeStatus(status);

  if (["completed", "approved", "confirmed", "paid", "verified"].includes(value)) {
    return "success";
  }

  if (["pending", "scheduled", "for_approval"].includes(value)) {
    return "warning";
  }

  if (["cancelled", "canceled", "rejected", "failed"].includes(value)) {
    return "danger";
  }

  if (["in_progress", "processing", "ongoing"].includes(value)) {
    return "info";
  }

  return "muted";
};

const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildRequestTransaction = (request, index) => {
  const rawId = request.id || request.request_id || request.service_request_id || index + 1;
  const dateSource =
    request.date ||
    request.request_date ||
    request.booking_date ||
    request.appointment_date ||
    request.scheduled_at ||
    request.created_at;

  return {
    id: `REQ-${rawId}`,
    rawId,
    customer:
      request.customer_name ||
      request.customer?.name ||
      request.customer ||
      request.owner_name ||
      "Unknown Customer",
    pet: request.pet_name || request.pet?.name || request.pet || "N/A",
    type: "appointment",
    typeLabel: "Appointment",
    service:
      request.service ||
      request.service_name ||
      request.service?.name ||
      request.type ||
      request.service_type ||
      "General Service",
    date: toDateKey(dateSource),
    displayDate: formatDateDisplay(dateSource),
    time:
      request.time ||
      request.request_time ||
      request.booking_time ||
      request.appointment_time ||
      request.scheduled_time ||
      "",
    amount: numberValue(request.amount || request.price || request.total_amount),
    status: normalizeStatus(request.status),
    notes: request.notes || request.remarks || request.description || "",
    source: "Service Request",
    raw: request,
  };
};

const buildOrderTransaction = (order, index) => {
  const rawId = order.id || order.order_id || order.order_number || index + 1;
  const dateSource = order.date || order.order_date || order.created_at || order.updated_at;

  return {
    id: `ORD-${rawId}`,
    rawId,
    customer:
      order.customer_name ||
      order.customer?.name ||
      order.customer ||
      order.client_name ||
      "Unknown Customer",
    pet: "N/A",
    type: "order",
    typeLabel: "Order",
    service:
      order.product_name ||
      order.product ||
      order.service ||
      order.service_name ||
      order.order_type ||
      "Product Order",
    date: toDateKey(dateSource),
    displayDate: formatDateDisplay(dateSource),
    time: order.time || order.order_time || order.created_at || "",
    amount: numberValue(order.amount || order.total || order.total_amount || order.grand_total),
    status: normalizeStatus(order.status || order.payment_status),
    notes: order.notes || order.remarks || order.cashier_remarks || "",
    source: "Customer Order",
    raw: order,
  };
};

const ReceptionistReports = () => {
  const defaultRange = useMemo(() => getDefaultDateRange(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [statusFilter, setStatusFilter] = useState("all");
  const [transactionTypeFilter, setTransactionTypeFilter] = useState("all");

  const [transactions, setTransactions] = useState([]);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [lastUpdated, setLastUpdated] = useState("");

  const fetchReportData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result = await apiRequest("/receptionist/reports/live");
      const data = result?.data || result || {};

      const requests = normalizeList(data.requests || data.service_requests || [], [
        "requests",
        "service_requests",
      ]);

      const orders = normalizeList(data.orders || data.customer_orders || [], [
        "orders",
        "customer_orders",
      ]);

      const transformedTransactions = [
        ...requests.map(buildRequestTransaction),
        ...orders.map(buildOrderTransaction),
      ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      setTransactions(transformedTransactions);
      setLastUpdated(new Date().toLocaleString("en-PH"));
    } catch (err) {
      console.error("Failed to fetch receptionist reports:", err);
      setError(err.message || "Failed to load live receptionist report data.");
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions];

    if (startDate || endDate) {
      filtered = filterByDateRange(filtered, "date", startDate, endDate);
    }

    if (statusFilter !== "all") {
      filtered = filterByStatus(filtered, "status", statusFilter);
    }

    if (transactionTypeFilter !== "all") {
      filtered = filtered.filter(
        (transaction) => transaction.type === transactionTypeFilter
      );
    }

    if (searchTerm.trim()) {
      const search = searchTerm.trim().toLowerCase();

      filtered = filtered.filter((transaction) =>
        [
          transaction.id,
          transaction.rawId,
          transaction.customer,
          transaction.pet,
          transaction.type,
          transaction.typeLabel,
          transaction.service,
          transaction.status,
          transaction.notes,
          transaction.source,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search)
      );
    }

    return filtered;
  }, [
    transactions,
    startDate,
    endDate,
    statusFilter,
    transactionTypeFilter,
    searchTerm,
  ]);

  const summaryStats = useMemo(() => {
    const totalTransactions = filteredTransactions.length;
    const appointments = filteredTransactions.filter(
      (transaction) => transaction.type === "appointment"
    ).length;
    const orders = filteredTransactions.filter(
      (transaction) => transaction.type === "order"
    ).length;
    const completedTransactions = filteredTransactions.filter((transaction) =>
      ["completed", "approved", "confirmed", "paid", "verified"].includes(
        normalizeStatus(transaction.status)
      )
    ).length;
    const pendingTransactions = filteredTransactions.filter((transaction) =>
      ["pending", "scheduled", "for_approval"].includes(
        normalizeStatus(transaction.status)
      )
    ).length;
    const totalRevenue = filteredTransactions.reduce(
      (sum, transaction) => sum + numberValue(transaction.amount),
      0
    );

    return {
      totalTransactions,
      appointments,
      orders,
      completedTransactions,
      pendingTransactions,
      totalRevenue,
    };
  }, [filteredTransactions]);

  const summaryCards = [
    {
      id: "total-transactions",
      label: "Filtered Transactions",
      value: summaryStats.totalTransactions,
      icon: faChartLine,
      tone: "primary",
    },
    {
      id: "appointments",
      label: "Appointments",
      value: summaryStats.appointments,
      icon: faCalendarCheck,
      tone: "success",
    },
    {
      id: "orders",
      label: "Orders",
      value: summaryStats.orders,
      icon: faShoppingBag,
      tone: "secondary",
    },
    {
      id: "completed",
      label: "Completed / Confirmed",
      value: summaryStats.completedTransactions,
      icon: faCheckCircle,
      tone: "warning",
    },
    {
      id: "pending",
      label: "Pending / Scheduled",
      value: summaryStats.pendingTransactions,
      icon: faClock,
      tone: "info",
    },
    {
      id: "total-revenue",
      label: "Filtered Revenue",
      value: formatCurrency(summaryStats.totalRevenue),
      icon: faMoneyBillWave,
      tone: "money",
    },
  ];

  const transactionTypeData = useMemo(() => {
    const typeCounts = {};

    filteredTransactions.forEach((transaction) => {
      const type = transaction.typeLabel || "Unknown";
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    return Object.entries(typeCounts).map(([type, count]) => ({
      type,
      count,
    }));
  }, [filteredTransactions]);

  const dailyTransactionsData = useMemo(() => {
    const dailyCounts = {};

    filteredTransactions.forEach((transaction) => {
      if (!transaction.date) return;

      if (!dailyCounts[transaction.date]) {
        dailyCounts[transaction.date] = {
          date: transaction.date,
          count: 0,
          revenue: 0,
        };
      }

      dailyCounts[transaction.date].count += 1;
      dailyCounts[transaction.date].revenue += numberValue(transaction.amount);
    });

    return Object.values(dailyCounts)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-14);
  }, [filteredTransactions]);

  const handleDateChange = (key, value) => {
    if (key === "startDate") setStartDate(value);
    if (key === "endDate") setEndDate(value);
  };

  const handleClearFilters = () => {
    const range = getDefaultDateRange();

    setSearchTerm("");
    setStatusFilter("all");
    setTransactionTypeFilter("all");
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const exportColumns = [
    { key: "id", label: "Transaction ID" },
    { key: "customer", label: "Customer" },
    { key: "pet", label: "Pet" },
    { key: "typeLabel", label: "Type" },
    { key: "service", label: "Service" },
    { key: "date", label: "Date", format: "date" },
    { key: "time", label: "Time" },
    { key: "amount", label: "Amount", format: "currency" },
    { key: "status", label: "Status" },
    { key: "notes", label: "Notes" },
  ];

  const handleExportCSV = () => {
    exportToCSV(
      filteredTransactions,
      exportColumns,
      "receptionist-transactions-report"
    );
  };

  const handleExportPDF = () => {
    exportToPDF(
      filteredTransactions,
      exportColumns,
      "Receptionist Transactions Report",
      "receptionist-transactions-report"
    );
  };

  const handleExportExcel = () => {
    exportToExcel(
      filteredTransactions,
      exportColumns,
      "receptionist-transactions-report"
    );
  };

  return (
    <StandardReportLayout
      title="Receptionist Reports"
      subtitle="Appointment scheduling, order management, customer service records, and front desk transaction metrics"
      icon={faCalendarCheck}
      loading={loading}
      error={error}
      onRefresh={fetchReportData}
      lastUpdated={lastUpdated || "Not refreshed yet"}
    >
      <div className="receptionist-reports-content">
        <section className="rr-insight-bar">
          <div>
            <span className="rr-eyebrow">
              <FontAwesomeIcon icon={faReceipt} />
              Live Receptionist Report
            </span>
            <h2>Front Desk Transaction Overview</h2>
            <p>
              Showing filtered appointment and order records from the receptionist
              live report endpoint.
            </p>
          </div>

          <div className="rr-insight-meta">
            <span>
              <FontAwesomeIcon icon={faUsers} />
              {new Set(filteredTransactions.map((item) => item.customer)).size} Customers
            </span>
            <span>
              <FontAwesomeIcon icon={faSearch} />
              {filteredTransactions.length} Visible Records
            </span>
          </div>
        </section>

        <section className="rr-summary-grid">
          {summaryCards.map((card) => (
            <article className={`rr-summary-card ${card.tone}`} key={card.id}>
              <span>
                <FontAwesomeIcon icon={card.icon} />
              </span>
              <div>
                <strong>{card.value}</strong>
                <p>{card.label}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="rr-charts-grid">
          <article className="rr-chart-card">
            <div className="rr-section-head">
              <div>
                <span className="rr-eyebrow">Breakdown</span>
                <h3>Transaction Types</h3>
              </div>
            </div>

            {transactionTypeData.length === 0 ? (
              <div className="rr-empty-chart">
                <FontAwesomeIcon icon={faInfoCircle} />
                <p>No transaction type data available.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={transactionTypeData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ type, percent }) =>
                      `${type}: ${(percent * 100).toFixed(0)}%`
                    }
                    outerRadius={95}
                    dataKey="count"
                  >
                    {transactionTypeData.map((entry, index) => (
                      <Cell
                        key={`type-cell-${entry.type}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </article>

          <article className="rr-chart-card">
            <div className="rr-section-head">
              <div>
                <span className="rr-eyebrow">Trend</span>
                <h3>Daily Transactions</h3>
              </div>
            </div>

            {dailyTransactionsData.length === 0 ? (
              <div className="rr-empty-chart">
                <FontAwesomeIcon icon={faInfoCircle} />
                <p>No daily transaction data available.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={dailyTransactionsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Transactions"
                    stroke="#ff5f93"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </article>
        </section>

        <section className="rr-table-card">
          <div className="rr-section-head">
            <div>
              <span className="rr-eyebrow">
                <FontAwesomeIcon icon={faReceipt} />
                Transaction Records
              </span>
              <h3>Transaction History</h3>
              <p>
                Showing <strong>{filteredTransactions.length}</strong> of{" "}
                <strong>{transactions.length}</strong> total record(s).
              </p>
            </div>
          </div>

          <StandardTable
            columns={[
              { key: "id", label: "Transaction", sortable: true, render: (value) => (
                <span className="rr-id-badge">{value}</span>
              )},
              { key: "customer", label: "Customer", sortable: true, render: (value) => (
                <strong className="rr-customer-name">{value}</strong>
              )},
              { key: "pet", label: "Pet", sortable: true, render: (value) => value || "N/A" },
              { key: "type", label: "Type", sortable: true, render: (value, transaction) => (
                <span className={`rr-type-badge ${value}`}>
                  {transaction.typeLabel}
                </span>
              )},
              { key: "service", label: "Service", sortable: true },
              { key: "date", label: "Date", sortable: true, render: (value, transaction) => (
                <div className="rr-date-cell">
                  <span>{transaction.displayDate || formatDateDisplay(value)}</span>
                  <small>{formatTimeDisplay(transaction.time)}</small>
                </div>
              )},
              { key: "amount", label: "Amount", sortable: true, format: "currency" },
              { key: "status", label: "Status", sortable: true, render: (value) => (
                <span className={`rr-status-badge ${getStatusClass(value)}`}>
                  {formatLabel(value)}
                </span>
              )},
              { key: "actions", label: "Action", sortable: false, render: (_value, transaction) => (
                <button
                  type="button"
                  className="rr-view-btn"
                  onClick={() => setSelectedTransaction(transaction)}
                  title="View details"
                >
                  <FontAwesomeIcon icon={faEye} />
                </button>
              )},
            ]}
            data={filteredTransactions}
            emptyMessage="No transactions found. Try changing the date range, status, type, or search filter."
            pageSize={10}
          />
        </section>

        {selectedTransaction && (
          <div
            className="rr-modal-overlay"
            onClick={() => setSelectedTransaction(null)}
          >
            <div className="rr-modal" onClick={(event) => event.stopPropagation()}>
              <div className="rr-modal-header">
                <div>
                  <span className="rr-eyebrow">
                    <FontAwesomeIcon icon={faEye} />
                    Transaction Details
                  </span>
                  <h2>{selectedTransaction.id}</h2>
                </div>

                <button
                  type="button"
                  className="rr-close-btn"
                  onClick={() => setSelectedTransaction(null)}
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>

              <div className="rr-modal-body">
                <div className="rr-detail-grid">
                  <DetailItem label="Customer" value={selectedTransaction.customer} />
                  <DetailItem label="Pet" value={selectedTransaction.pet} />
                  <DetailItem label="Source" value={selectedTransaction.source} />
                  <DetailItem label="Type" value={selectedTransaction.typeLabel} />
                  <DetailItem label="Service" value={selectedTransaction.service} />
                  <DetailItem label="Date" value={selectedTransaction.displayDate} />
                  <DetailItem
                    label="Time"
                    value={formatTimeDisplay(selectedTransaction.time)}
                  />
                  <DetailItem
                    label="Amount"
                    value={formatCurrency(selectedTransaction.amount)}
                  />
                  <DetailItem
                    label="Status"
                    value={formatLabel(selectedTransaction.status)}
                  />
                  <DetailItem
                    label="Notes"
                    value={selectedTransaction.notes || "No notes provided."}
                    wide
                  />
                </div>

                <details className="rr-raw-record">
                  <summary>Show raw record data</summary>
                  <pre>{JSON.stringify(selectedTransaction.raw, null, 2)}</pre>
                </details>
              </div>

              <div className="rr-modal-actions">
                <button
                  type="button"
                  className="rr-secondary-btn"
                  onClick={() => setSelectedTransaction(null)}
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

const DetailItem = ({ label, value, wide = false }) => (
  <div className={`rr-detail-item ${wide ? "wide" : ""}`}>
    <small>{label}</small>
    <strong>{value || "N/A"}</strong>
  </div>
);

export default ReceptionistReports;