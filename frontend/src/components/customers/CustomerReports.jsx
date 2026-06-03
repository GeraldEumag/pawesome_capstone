import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarCheck,
  faCheckCircle,
  faClock,
  faEye,
  faInfoCircle,
  faMoneyBillWave,
  faPaw,
  faReceipt,
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
import { showError } from "../../utils/alert";
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
import "./CustomerReports.css";

const CHART_COLORS = [
  "#ff5f93",
  "#ff8db5",
  "#ffc8dd",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
];

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
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.bookings)) return payload.bookings;
  if (Array.isArray(payload?.appointments)) return payload.appointments;
  if (Array.isArray(payload?.pets)) return payload.pets;
  if (Array.isArray(payload?.transactions)) return payload.transactions;
  if (Array.isArray(payload?.orders)) return payload.orders;
  if (Array.isArray(payload?.purchases)) return payload.purchases;

  return [];
};

const normalizeStatus = (value) =>
  String(value || "pending").toLowerCase().replace(/\s+/g, "_");

const formatLabel = (value) =>
  String(value || "N/A")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

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

const getBookingId = (booking, index) =>
  booking.id ||
  booking.booking_id ||
  booking.appointment_id ||
  booking.request_id ||
  `BK-${index + 1}`;

const normalizeBooking = (booking, index) => {
  const dateSource =
    booking.date ||
    booking.booking_date ||
    booking.appointment_date ||
    booking.request_date ||
    booking.scheduled_date ||
    booking.created_at;

  const rawId = getBookingId(booking, index);

  return {
    id: rawId,
    displayId: String(rawId).startsWith("BK-") ? String(rawId) : `BK-${rawId}`,
    customer_name:
      booking.customer_name ||
      booking.customer?.name ||
      booking.customer ||
      booking.client_name ||
      booking.owner_name ||
      "Unknown Customer",
    pet_name:
      booking.pet_name ||
      booking.pet?.name ||
      booking.pet ||
      booking.petName ||
      "N/A",
    service:
      booking.service ||
      booking.service_name ||
      booking.service?.name ||
      booking.type ||
      booking.service_type ||
      "General Service",
    date: toDateKey(dateSource),
    displayDate: formatDateDisplay(dateSource),
    time:
      booking.time ||
      booking.booking_time ||
      booking.appointment_time ||
      booking.request_time ||
      booking.scheduled_time ||
      "",
    status: normalizeStatus(booking.status),
    amount: numberValue(booking.amount || booking.price || booking.total_amount),
    notes: booking.notes || booking.remarks || booking.description || "",
    raw: booking,
  };
};

const CustomerReports = () => {
  const location = useLocation();
  const defaultRange = useMemo(() => getDefaultDateRange(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [statusFilter, setStatusFilter] = useState("all");

  const [bookings, setBookings] = useState([]);
  const [pets, setPets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [purchases, setPurchases] = useState([]);

  const [selectedBooking, setSelectedBooking] = useState(null);
  const [lastUpdated, setLastUpdated] = useState("");

  const fetchReportData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const isAdminReport = location.pathname.startsWith("/admin/reports/customers");

      if (isAdminReport) {
        const result = await apiRequest("/admin/reports/customers");
        const data = result?.data || result || {};

        setBookings(
          normalizeList(data.appointments || data.bookings || data.requests || [], [
            "appointments",
            "bookings",
            "requests",
          ])
        );
        setPets(normalizeList(data.pets || [], ["pets"]));
        setTransactions(normalizeList(data.transactions || data.payments || [], ["transactions", "payments"]));
        setPurchases(normalizeList(data.orders || data.purchases || [], ["orders", "purchases"]));
      } else {
        const [bookingsData, petsData, transactionsData, purchasesData] =
          await Promise.all([
            apiRequest("/customer/bookings").catch(() => []),
            apiRequest("/customer/pets").catch(() => []),
            apiRequest("/customer/transactions").catch(() => []),
            apiRequest("/customer/purchases").catch(() => []),
          ]);

        setBookings(normalizeList(bookingsData, ["bookings", "appointments", "requests"]));
        setPets(normalizeList(petsData, ["pets"]));
        setTransactions(normalizeList(transactionsData, ["transactions", "payments"]));
        setPurchases(normalizeList(purchasesData, ["purchases", "orders"]));
      }

      setLastUpdated(new Date().toLocaleString("en-PH"));
    } catch (err) {
      console.error("Failed to fetch customer reports:", err);
      setError(err.message || "Failed to load live customer report data.");
      showError(err.message || "Failed to load live customer report data.");
      setBookings([]);
      setPets([]);
      setTransactions([]);
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const normalizedBookings = useMemo(
    () => bookings.map((booking, index) => normalizeBooking(booking, index)),
    [bookings]
  );

  const filteredBookings = useMemo(() => {
    let filtered = [...normalizedBookings];

    if (startDate || endDate) {
      filtered = filterByDateRange(filtered, "date", startDate, endDate);
    }

    if (statusFilter !== "all") {
      filtered = filterByStatus(filtered, "status", statusFilter);
    }

    if (searchTerm.trim()) {
      const search = searchTerm.trim().toLowerCase();

      filtered = filtered.filter((booking) =>
        [
          booking.id,
          booking.displayId,
          booking.customer_name,
          booking.pet_name,
          booking.service,
          booking.status,
          booking.amount,
          booking.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search)
      );
    }

    return filtered;
  }, [normalizedBookings, startDate, endDate, statusFilter, searchTerm]);

  const summaryStats = useMemo(() => {
    const completedBookings = filteredBookings.filter(
      (booking) => normalizeStatus(booking.status) === "completed"
    ).length;

    const pendingBookings = filteredBookings.filter((booking) =>
      ["pending", "scheduled", "for_approval"].includes(normalizeStatus(booking.status))
    ).length;

    const cancelledBookings = filteredBookings.filter((booking) =>
      ["cancelled", "canceled", "rejected"].includes(normalizeStatus(booking.status))
    ).length;

    const totalBookingAmount = filteredBookings.reduce(
      (sum, booking) => sum + numberValue(booking.amount),
      0
    );

    const totalTransactionAmount = transactions.reduce(
      (sum, transaction) =>
        sum + numberValue(transaction.amount || transaction.total_amount || transaction.total),
      0
    );

    const totalPurchaseAmount = purchases.reduce(
      (sum, purchase) =>
        sum + numberValue(purchase.amount || purchase.total_amount || purchase.total),
      0
    );

    return {
      totalBookings: filteredBookings.length,
      completedBookings,
      pendingBookings,
      cancelledBookings,
      totalPets: pets.length,
      totalPurchases: purchases.length,
      totalSpent: totalTransactionAmount + totalPurchaseAmount || totalBookingAmount,
    };
  }, [filteredBookings, pets.length, transactions, purchases]);

  const summaryCards = [
    {
      id: "total-bookings",
      label: "Filtered Bookings",
      value: summaryStats.totalBookings,
      icon: faCalendarCheck,
      tone: "primary",
    },
    {
      id: "completed-bookings",
      label: "Completed",
      value: summaryStats.completedBookings,
      icon: faCheckCircle,
      tone: "success",
    },
    {
      id: "pending-bookings",
      label: "Pending / Scheduled",
      value: summaryStats.pendingBookings,
      icon: faClock,
      tone: "warning",
    },
    {
      id: "total-pets",
      label: "Registered Pets",
      value: summaryStats.totalPets,
      icon: faPaw,
      tone: "secondary",
    },
    {
      id: "total-purchases",
      label: "Purchases",
      value: summaryStats.totalPurchases,
      icon: faShoppingBag,
      tone: "info",
    },
    {
      id: "total-spent",
      label: "Customer Value",
      value: formatCurrency(summaryStats.totalSpent),
      icon: faMoneyBillWave,
      tone: "money",
    },
  ];

  const statusDistributionData = useMemo(() => {
    const statusCounts = {};

    filteredBookings.forEach((booking) => {
      const status = formatLabel(booking.status);
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
    }));
  }, [filteredBookings]);

  const monthlyBookingsData = useMemo(() => {
    const monthlyCounts = {};

    filteredBookings.forEach((booking) => {
      if (!booking.date) return;

      const date = new Date(booking.date);
      if (Number.isNaN(date.getTime())) return;

      const month = date.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });

      if (!monthlyCounts[month]) {
        monthlyCounts[month] = {
          month,
          count: 0,
          revenue: 0,
          sortDate: date,
        };
      }

      monthlyCounts[month].count += 1;
      monthlyCounts[month].revenue += numberValue(booking.amount);
    });

    return Object.values(monthlyCounts)
      .sort((a, b) => a.sortDate - b.sortDate)
      .slice(-6);
  }, [filteredBookings]);

  const serviceBreakdown = useMemo(() => {
    const serviceCounts = {};

    filteredBookings.forEach((booking) => {
      const service = booking.service || "General Service";

      if (!serviceCounts[service]) {
        serviceCounts[service] = {
          service,
          count: 0,
          amount: 0,
        };
      }

      serviceCounts[service].count += 1;
      serviceCounts[service].amount += numberValue(booking.amount);
    });

    return Object.values(serviceCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredBookings]);

  const bookingExportColumns = [
    { key: "displayId", label: "Booking ID" },
    { key: "customer_name", label: "Customer" },
    { key: "pet_name", label: "Pet" },
    { key: "service", label: "Service" },
    { key: "date", label: "Date", format: "date" },
    { key: "time", label: "Time" },
    { key: "status", label: "Status" },
    { key: "amount", label: "Amount", format: "currency" },
    { key: "notes", label: "Notes" },
  ];

  const handleDateChange = (key, value) => {
    if (key === "startDate") setStartDate(value);
    if (key === "endDate") setEndDate(value);
  };

  const handleClearFilters = () => {
    const range = getDefaultDateRange();

    setSearchTerm("");
    setStatusFilter("all");
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const handleExportCSV = () => {
    exportToCSV(filteredBookings, bookingExportColumns, "customer-bookings-report");
  };

  const handleExportPDF = () => {
    exportToPDF(
      filteredBookings,
      bookingExportColumns,
      "Customer Bookings Report",
      "customer-bookings-report"
    );
  };

  const handleExportExcel = () => {
    exportToExcel(filteredBookings, bookingExportColumns, "customer-bookings-report");
  };

  return (
    <StandardReportLayout
      title="Customer Reports"
      subtitle="Booking history, pet records, spending activity, and customer service analytics"
      icon={faUsers}
      loading={loading}
      error={error}
      onRefresh={fetchReportData}
      lastUpdated={lastUpdated || "Not refreshed yet"}
    >
      <div className="customer-reports-content">
        <section className="cr-insight-bar">
          <div>
            <span className="cr-eyebrow">
              <FontAwesomeIcon icon={faReceipt} />
              Live Customer Report
            </span>

            <h2>Customer Activity Overview</h2>

            <p>
              Review filtered booking activity, pet ownership records, customer value,
              status breakdown, and service demand.
            </p>
          </div>

          <div className="cr-insight-meta">
            <span>
              <FontAwesomeIcon icon={faUsers} />
              {new Set(filteredBookings.map((item) => item.customer_name)).size} Customers
            </span>

            <span>
              <FontAwesomeIcon icon={faPaw} />
              {pets.length} Pets
            </span>

            <span>
              <FontAwesomeIcon icon={faSearch} />
              {filteredBookings.length} Visible Records
            </span>
          </div>
        </section>

        <section className="cr-summary-grid">
          {summaryCards.map((card) => (
            <article className={`cr-summary-card ${card.tone}`} key={card.id}>
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

        <section className="cr-charts-grid">
          <article className="cr-chart-card">
            <div className="cr-section-head">
              <div>
                <span className="cr-eyebrow">Breakdown</span>
                <h3>Booking Status Distribution</h3>
              </div>
            </div>

            {statusDistributionData.length === 0 ? (
              <div className="cr-empty-chart">
                <FontAwesomeIcon icon={faInfoCircle} />
                <p>No status data available for the selected filters.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={statusDistributionData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ status, percent }) =>
                      `${status}: ${(percent * 100).toFixed(0)}%`
                    }
                    outerRadius={95}
                    dataKey="count"
                  >
                    {statusDistributionData.map((entry, index) => (
                      <Cell
                        key={`status-cell-${entry.status}`}
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

          <article className="cr-chart-card">
            <div className="cr-section-head">
              <div>
                <span className="cr-eyebrow">Trend</span>
                <h3>Monthly Booking Trend</h3>
              </div>
            </div>

            {monthlyBookingsData.length === 0 ? (
              <div className="cr-empty-chart">
                <FontAwesomeIcon icon={faInfoCircle} />
                <p>No monthly trend data available for the selected filters.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={monthlyBookingsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Bookings"
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

        <section className="cr-service-card">
          <div className="cr-section-head">
            <div>
              <span className="cr-eyebrow">
                <FontAwesomeIcon icon={faCalendarCheck} />
                Service Demand
              </span>
              <h3>Top Requested Services</h3>
              <p>Most requested services based on the current report filters.</p>
            </div>
          </div>

          {serviceBreakdown.length === 0 ? (
            <div className="cr-empty-service">
              <FontAwesomeIcon icon={faInfoCircle} />
              <p>No service data available.</p>
            </div>
          ) : (
            <div className="cr-service-list">
              {serviceBreakdown.map((item) => (
                <div className="cr-service-item" key={item.service}>
                  <div>
                    <strong>{item.service}</strong>
                    <small>{item.count} booking(s)</small>
                  </div>

                  <span>{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="cr-table-card">
          <div className="cr-section-head">
            <div>
              <span className="cr-eyebrow">
                <FontAwesomeIcon icon={faReceipt} />
                Booking Records
              </span>

              <h3>Booking History</h3>

              <p>
                Showing <strong>{filteredBookings.length}</strong> of{" "}
                <strong>{normalizedBookings.length}</strong> booking record(s).
              </p>
            </div>
          </div>

          <StandardTable
            columns={[
              { key: "displayId", label: "Booking", sortable: true, render: (value) => (
                <span className="cr-id-badge">{value}</span>
              )},
              { key: "customer_name", label: "Customer", sortable: true, render: (value) => (
                <strong className="cr-customer-name">{value}</strong>
              )},
              { key: "pet_name", label: "Pet", sortable: true },
              { key: "service", label: "Service", sortable: true },
              { key: "displayDate", label: "Schedule", sortable: true, render: (value, booking) => (
                <div className="cr-date-cell">
                  <span>{value}</span>
                  <small>{formatTimeDisplay(booking.time)}</small>
                </div>
              )},
              { key: "amount", label: "Amount", sortable: true, format: "currency" },
              { key: "status", label: "Status", sortable: true, render: (value) => (
                <span className={`cr-status-badge ${getStatusClass(value)}`}>
                  {formatLabel(value)}
                </span>
              )},
              { key: "actions", label: "Action", sortable: false, render: (_value, booking) => (
                <button
                  type="button"
                  className="cr-view-btn"
                  onClick={() => setSelectedBooking(booking)}
                  title="View booking details"
                >
                  <FontAwesomeIcon icon={faEye} />
                </button>
              )},
            ]}
            data={filteredBookings}
            emptyMessage="No bookings found. Try changing the date range, status, or search filter."
            pageSize={10}
          />
        </section>

        {selectedBooking && (
          <div
            className="cr-modal-overlay"
            onClick={() => setSelectedBooking(null)}
          >
            <div className="cr-modal" onClick={(event) => event.stopPropagation()}>
              <div className="cr-modal-header">
                <div>
                  <span className="cr-eyebrow">
                    <FontAwesomeIcon icon={faEye} />
                    Booking Details
                  </span>

                  <h2>{selectedBooking.displayId}</h2>
                </div>

                <button
                  type="button"
                  className="cr-close-btn"
                  onClick={() => setSelectedBooking(null)}
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>

              <div className="cr-modal-body">
                <div className="cr-detail-grid">
                  <DetailItem label="Customer" value={selectedBooking.customer_name} />
                  <DetailItem label="Pet" value={selectedBooking.pet_name} />
                  <DetailItem label="Service" value={selectedBooking.service} />
                  <DetailItem label="Date" value={selectedBooking.displayDate} />
                  <DetailItem
                    label="Time"
                    value={formatTimeDisplay(selectedBooking.time)}
                  />
                  <DetailItem
                    label="Amount"
                    value={formatCurrency(selectedBooking.amount)}
                  />
                  <DetailItem
                    label="Status"
                    value={formatLabel(selectedBooking.status)}
                  />
                  <DetailItem
                    label="Notes"
                    value={selectedBooking.notes || "No notes provided."}
                    wide
                  />
                </div>

                <details className="cr-raw-record">
                  <summary>Show raw booking data</summary>
                  <pre>{JSON.stringify(selectedBooking.raw, null, 2)}</pre>
                </details>
              </div>

              <div className="cr-modal-actions">
                <button
                  type="button"
                  className="cr-secondary-btn"
                  onClick={() => setSelectedBooking(null)}
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
  <div className={`cr-detail-item ${wide ? "wide" : ""}`}>
    <small>{label}</small>
    <strong>{value || "N/A"}</strong>
  </div>
);

export default CustomerReports;