import React, { useCallback, useMemo, useState } from "react";
import {
  faCalendarCheck,
  faCheckCircle,
  faClock,
  faMoneyBillWave,
  faReceipt,
  faShoppingBag,
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
import UnifiedReportEngine, { ChartContainer, CHART_COLORS } from "../shared/UnifiedReportEngine";
import "./ReceptionistReports.css";

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
  const [transactions, setTransactions] = useState([]);

  const fetchReportData = useCallback(async (filters) => {
    const result = await apiRequest("/receptionist/reports/live");
    const data = result?.data || result || {};

    const requests = normalizeList(data.requests || data.service_requests || [], [
      "requests", "service_requests",
    ]);
    const orders = normalizeList(data.orders || data.customer_orders || [], [
      "orders", "customer_orders",
    ]);

    const transformedTransactions = [
      ...requests.map(buildRequestTransaction),
      ...orders.map(buildOrderTransaction),
    ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    setTransactions(transformedTransactions);
    return transformedTransactions;
  }, []);

  // Summary cards
  const summaryCards = useMemo(() => {
    const total = transactions.length;
    const appointments = transactions.filter((t) => t.type === "appointment").length;
    const orders = transactions.filter((t) => t.type === "order").length;
    const completed = transactions.filter((t) =>
      ["completed", "approved", "confirmed", "paid"].includes(normalizeStatus(t.status))
    ).length;
    const pending = transactions.filter((t) =>
      ["pending", "scheduled"].includes(normalizeStatus(t.status))
    ).length;
    const revenue = transactions.reduce((sum, t) => sum + numberValue(t.amount), 0);

    return [
      { id: "total", label: "Total Transactions", value: total, icon: faReceipt, tone: "primary" },
      { id: "appointments", label: "Appointments", value: appointments, icon: faCalendarCheck, tone: "success" },
      { id: "orders", label: "Orders", value: orders, icon: faShoppingBag, tone: "secondary" },
      { id: "completed", label: "Completed", value: completed, icon: faCheckCircle, tone: "success" },
      { id: "pending", label: "Pending", value: pending, icon: faClock, tone: "warning" },
      { id: "revenue", label: "Total Revenue", value: formatCurrency(revenue), icon: faMoneyBillWave, tone: "money" },
    ];
  }, [transactions]);

  // Table columns
  const tableColumns = [
    { key: "id", label: "Transaction", sortable: true, render: (value) => <span className="rr-id-badge">{value}</span> },
    { key: "customer", label: "Customer", sortable: true },
    { key: "type", label: "Type", sortable: true, render: (value) => <span className={`rr-type-badge ${value}`}>{formatLabel(value)}</span> },
    { key: "service", label: "Service", sortable: true },
    { key: "date", label: "Date", format: "date", sortable: true },
    { key: "amount", label: "Amount", format: "currency", sortable: true },
    { key: "status", label: "Status", sortable: true, render: (value) => <span className={`rr-status-badge ${getStatusClass(value)}`}>{formatLabel(value)}</span> },
  ];

  // Custom type filter
  const customFilters = [
    {
      key: "transactionType",
      label: "Transaction Type",
      dataKey: "type",
      options: [
        { value: "appointment", label: "Appointments" },
        { value: "order", label: "Orders" },
      ],
    },
  ];

  // Chart data
  const chartData = useMemo(() => {
    const typeData = [
      { type: "appointment", count: transactions.filter((t) => t.type === "appointment").length },
      { type: "order", count: transactions.filter((t) => t.type === "order").length },
    ];

    const dailyData = transactions.reduce((acc, item) => {
      const date = item.date || new Date().toISOString().split("T")[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});
    const dailyArray = Object.entries(dailyData).map(([date, count]) => ({ date, count })).slice(-7);

    return { typeData, dailyArray };
  }, [transactions]);

  // Render charts
  const renderCharts = () => (
    <>
      <ChartContainer title="Transaction Types" subtitle="Appointments vs Orders">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData.typeData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="count">
              {chartData.typeData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name, props) => [`${value} ${props.payload.type}s`, "Count"]} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartContainer>

      <ChartContainer title="Daily Activity" subtitle="Transactions per day">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData.dailyArray}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
    </>
  );

  return (
    <UnifiedReportEngine
      title="Receptionist Reports"
      subtitle="Appointments, orders, and customer service activity"
      icon={faUsers}
      fetchData={fetchReportData}
      data={transactions}
      columns={tableColumns}
      summaryCards={summaryCards}
      charts={renderCharts()}
      statusOptions={["pending", "scheduled", "completed", "approved", "confirmed", "paid", "cancelled"]}
      customFilters={customFilters}
      exportFilename="receptionist-reports"
      exportTitle="Receptionist Reports"
      tablePageSize={12}
      tableEmptyMessage="No transactions found"
      enableSavedFilters={true}
      refreshInterval={30000}
    />
  );
};

export default ReceptionistReports;
