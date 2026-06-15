import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faCalendarAlt,
  faCalendarCheck,
  faChartLine,
  faCheck,
  faClipboardList,
  faClock,
  faExclamationTriangle,
  faFingerprint,
  faHistory,
  faMoneyBill,
  faMoon,
  faRefresh,
  faSpinner,
  faTableCells,
  faTimes,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { useAuth } from "../../context/AuthContext";
import ManagerSidebar from "./ManagerSidebar";
import DashboardLayout from "../shared/DashboardLayout";
import "./ManagerDashboard.css";

const DEFAULT_STATS = {
  totalSales: 0,
  totalReservations: 0,
  pendingReservations: 0,
  paidPayments: 0,
  pendingPayments: 0,
  rejectedPayments: 0,
  totalCustomers: 0,
  activeCustomers: 0,
  totalAppointments: 0,
  groomingRequests: 0,
  veterinaryAppointments: 0,
  boardingBookings: 0,
  lowStockItems: 0,
  completedServices: 0,
  todayAppointments: 0,
  todayRevenue: 0,
  monthlyRevenue: 0,
  approvedOrders: 0,
  rejectedOrders: 0,
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
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.items)) return payload.items;

  return [];
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value) =>
  String(value || "pending")
    .toLowerCase()
    .replace(/\s+/g, "_");

const formatStatusLabel = (value) =>
  String(value || "N/A")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatDateTime = (value) => {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatTime = (value) => {
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

const getEmployeeName = (record) =>
  record?.employee_name ||
  record?.staff_name ||
  record?.user?.name ||
  record?.employee?.name ||
  record?.name ||
  "Unknown Employee";

const getEmployeeRole = (record) =>
  record?.role ||
  record?.position ||
  record?.employee?.position ||
  record?.department ||
  "Staff";

const buildStatsFromData = (dashboardData) => {
  return {
    totalSales: toNumber(dashboardData.sales_total) || 0,
    totalReservations: toNumber(dashboardData.total_orders) || 0,
    pendingReservations: toNumber(dashboardData.pending_reservations || dashboardData.pending_orders) || 0,
    paidPayments: toNumber(dashboardData.paid_orders) || 0,
    pendingPayments: toNumber(dashboardData.pending_payments) || 0,
    rejectedPayments: toNumber(dashboardData.rejected_payments) || 0,
    totalCustomers: toNumber(dashboardData.total_customers) || 0,
    activeCustomers: toNumber(dashboardData.active_customers || dashboardData.total_customers) || 0,
    totalAppointments: toNumber(dashboardData.total_appointments) || 0,
    groomingRequests: toNumber(dashboardData.grooming_requests) || 0,
    veterinaryAppointments: toNumber(dashboardData.veterinary_appointments) || 0,
    boardingBookings: toNumber(dashboardData.boarding_bookings) || 0,
    lowStockItems: toNumber(dashboardData.low_stock_count) || 0,
    completedServices: toNumber(dashboardData.completed_services) || 0,
    todayAppointments: toNumber(dashboardData.today_appointments) || 0,
    todayRevenue: toNumber(dashboardData.today_revenue) || 0,
    monthlyRevenue: toNumber(dashboardData.monthly_revenue) || 0,
    approvedOrders: toNumber(dashboardData.approved_orders) || 0,
    rejectedOrders: toNumber(dashboardData.rejected_orders) || 0,
  };
};

const recordKey = (source, record, index) =>
  `${source}-${record?.source || record?.type || record?.category || "record"}-${record?.id || record?.payment_id || record?.request_id || record?.item_id || record?.log_id || "no-id"}-${index}`;

const ManagerDashboard = () => {
  const { user, updateUser } = useAuth();
  const name = user?.name || "Manager";
  const profilePhoto = user?.profile_photo || "";

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [lastUpdated, setLastUpdated] = useState("");

  const [dashboardStats, setDashboardStats] = useState(DEFAULT_STATS);
  const [recentPayments, setRecentPayments] = useState([]);
  const [recentBookings, setRecentBookings] = useState([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);

  const location = useLocation();
  const navigate = useNavigate();

  const normalizedPath = location.pathname.replace(/\/+$/, "");
  const showOverview =
    normalizedPath === "/manager" || normalizedPath === "/manager/";

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
    window.clearTimeout(window.managerDashboardToastTimer);
    window.managerDashboardToastTimer = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const handleProfilePhotoUpload = async (file) => {
    try {
      const { uploadProfilePhoto } = await import("../../api/client");
      const data = await uploadProfilePhoto(file);
      const photoUrl = data?.profile_photo || data?.url || "";
      if (photoUrl) updateUser({ profile_photo: photoUrl });
      showToast("Profile photo updated successfully.", "success");
    } catch (err) {
      showToast(err.message || "Failed to upload profile photo.", "error");
    }
  };

  const fetchDashboardData = useCallback(
    async ({ silent = false } = {}) => {
      if (!showOverview) return;

      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const requestResults = await Promise.allSettled([
          apiRequest("/manager/dashboard"),
          apiRequest("/manager/reports/payments"),
          apiRequest("/manager/reports/services"),
          apiRequest("/manager/reports/veterinary-services"),
          apiRequest("/manager/reports/inventory"),
          apiRequest("/manager/history"),
        ]);

        const [
          dashboardResponse,
          paymentsResponse,
          bookingsResponse,
          appointmentsResponse,
          lowStockResponse,
          historyResponse,
        ] = requestResults.map((result) => (result.status === "fulfilled" ? result.value : null));

        const dashboardData = dashboardResponse?.data || dashboardResponse || {};

        const paymentsList = normalizeList(paymentsResponse, [
          "payments",
          "records",
          "data",
        ]);

        const bookingsList = normalizeList(bookingsResponse, [
          "services",
          "service_requests",
          "requests",
          "data",
        ]);

        const appointmentsList = normalizeList(appointmentsResponse, [
          "appointments",
          "veterinary_services",
          "data",
        ]);

        const lowStockList = normalizeList(lowStockResponse, [
          "inventory",
          "items",
          "low_stock",
          "data",
        ]);

        const historyList = normalizeList(historyResponse, [
          "history",
          "activities",
          "logs",
          "records",
        ]);

        setDashboardStats({ ...DEFAULT_STATS, ...buildStatsFromData(dashboardData) });
        setRecentPayments(paymentsList.slice(0, 6));
        setRecentBookings(bookingsList.slice(0, 6));
        setUpcomingAppointments(appointmentsList.slice(0, 6));
        setLowStockItems(lowStockList.slice(0, 6));
        setRecentActivity(historyList.slice(0, 6));
        setLastUpdated(new Date().toLocaleString("en-PH"));

        if (!dashboardResponse && !paymentsResponse && !bookingsResponse) {
          setError(
            "No manager dashboard data available yet. The dashboard is ready, but backend data still needs to be connected."
          );
        }
      } catch (err) {
        setDashboardStats(DEFAULT_STATS);
        setError(err.message || "Failed to load manager dashboard data.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showOverview]
  );

  useEffect(() => {
    if (showOverview) {
      fetchDashboardData();
    }
  }, [showOverview, fetchDashboardData]);

  const summaryCards = useMemo(
    () => [
      {
        title: "Total Revenue",
        value: formatCurrency(dashboardStats.totalSales),
        subtitle: "Overall revenue",
        icon: faMoneyBill,
        tone: "money",
      },
      {
        title: "Total Reservations",
        value: dashboardStats.totalReservations,
        subtitle: "Orders, service requests, and bookings",
        icon: faClipboardList,
        tone: "primary",
      },
      {
        title: "Pending Reservations",
        value: dashboardStats.pendingReservations,
        subtitle: "Awaiting receptionist action",
        icon: faClock,
        tone: "warning",
      },
      {
        title: "Paid Payments",
        value: dashboardStats.paidPayments,
        subtitle: "Completed transactions",
        icon: faCheck,
        tone: "success",
      },
      {
        title: "Pending Payments",
        value: dashboardStats.pendingPayments,
        subtitle: "Awaiting verification",
        icon: faClock,
        tone: "warning",
      },
      {
        title: "Rejected Payments",
        value: dashboardStats.rejectedPayments,
        subtitle: "Rejected proof or payment records",
        icon: faTimes,
        tone: "danger",
      },
      {
        title: "Total Customers",
        value: dashboardStats.totalCustomers,
        subtitle: "Registered clients",
        icon: faUsers,
        tone: "primary",
      },
      {
        title: "Active Customers",
        value: dashboardStats.activeCustomers,
        subtitle: "Currently active customer records",
        icon: faUsers,
        tone: "success",
      },
      {
        title: "Total Appointments",
        value: dashboardStats.totalAppointments,
        subtitle: "Scheduled services",
        icon: faCalendarCheck,
        tone: "info",
      },
      {
        title: "Grooming Requests",
        value: dashboardStats.groomingRequests,
        subtitle: "Pet grooming bookings",
        icon: faCalendarAlt,
        tone: "neutral",
      },
      {
        title: "Veterinary Appointments",
        value: dashboardStats.veterinaryAppointments,
        subtitle: "Vet consultations",
        icon: faCalendarCheck,
        tone: "success",
      },
      {
        title: "Boarding Bookings",
        value: dashboardStats.boardingBookings,
        subtitle: "Hotel stays",
        icon: faMoon,
        tone: "info",
      },
      {
        title: "Low Stock Items",
        value: dashboardStats.lowStockItems,
        subtitle: "Needs restocking",
        icon: faExclamationTriangle,
        tone: "danger",
      },
      {
        title: "Completed Services",
        value: dashboardStats.completedServices,
        subtitle: "Finished services",
        icon: faCheck,
        tone: "success",
      },
      {
        title: "Today's Appointments",
        value: dashboardStats.todayAppointments,
        subtitle: "Scheduled for today",
        icon: faCalendarAlt,
        tone: "info",
      },
      {
        title: "Today's Revenue",
        value: formatCurrency(dashboardStats.todayRevenue),
        subtitle: "Daily earnings",
        icon: faChartLine,
        tone: "money",
      },
      {
        title: "Monthly Revenue",
        value: formatCurrency(dashboardStats.monthlyRevenue),
        subtitle: "This month",
        icon: faChartLine,
        tone: "primary",
      },
    ],
    [dashboardStats]
  );

  const quickActions = [
    {
      title: "Sales Report",
      description: "View detailed sales analytics and trends.",
      icon: faChartLine,
      path: "/manager/reports",
    },
    {
      title: "Payment Report",
      description: "Monitor payment status and transactions.",
      icon: faMoneyBill,
      path: "/manager/reports",
    },
    {
      title: "Inventory Report",
      description: "Check stock levels and low stock alerts.",
      icon: faExclamationTriangle,
      path: "/manager/reports",
    },
    {
      title: "Service Report",
      description: "View service requests and completions.",
      icon: faCalendarCheck,
      path: "/manager/reports",
    },
    {
      title: "Customer Report",
      description: "Analyze customer data and activity.",
      icon: faUsers,
      path: "/manager/reports",
    },
    {
      title: "Staff Performance",
      description: "Review staff productivity metrics.",
      icon: faUsers,
      path: "/manager/reports",
    },
    {
      title: "View History",
      description: "Review business activity and audit trail.",
      icon: faHistory,
      path: "/manager/history",
    },
  ];

  const revenueTotals = useMemo(() => {
    return {
      totalRevenue: dashboardStats.totalSales,
      todayRevenue: dashboardStats.todayRevenue,
      monthlyRevenue: dashboardStats.monthlyRevenue,
      approvedOrders: dashboardStats.approvedOrders,
      rejectedOrders: dashboardStats.rejectedOrders,
    };
  }, [dashboardStats]);

  const sidebar = <ManagerSidebar />;

  const extraActions = (
    <>
      <button
        className="manager-icon-btn"
        onClick={() => fetchDashboardData({ silent: true })}
        disabled={refreshing || loading}
        title="Refresh dashboard"
        type="button"
      >
        <FontAwesomeIcon
          icon={refreshing || loading ? faSpinner : faRefresh}
          spin={refreshing || loading}
        />
      </button>
    </>
  );

  const ROUTE_META = [
    { path: "/manager", title: "Manager Dashboard", subtitle: "Executive monitoring dashboard for reservations, services, payments, inventory, customers, and business performance." },
    { path: "/manager/staff", title: "Staff Performance", subtitle: "Monitor employee records and workforce performance (read-only)." },
    { path: "/manager/payroll", title: "Payroll Summary", subtitle: "View payroll status and cost summaries (read-only)." },
    { path: "/manager/history", title: "History / Audit Trail", subtitle: "Review business activity and system audit logs." },
    { path: "/manager/reports", title: "Reports", subtitle: "Access sales, payment, inventory, service, customer, and staff performance reports." },
    { path: "/manager/reservations", title: "Reservations Monitoring", subtitle: "Monitor appointment, grooming, boarding, and customer reservation activity." },
    { path: "/manager/services", title: "Service Monitoring", subtitle: "Monitor veterinary, grooming, and boarding service performance." },
    { path: "/manager/payments", title: "Payment Monitoring", subtitle: "Monitor paid, pending, and rejected payment records." },
    { path: "/manager/inventory", title: "Inventory Monitoring", subtitle: "Monitor stock levels, low-stock alerts, and inventory report data." },
    { path: "/manager/customers", title: "Customer Records", subtitle: "Review customer records and activity summaries." },
    { path: "/manager/profile", title: "Profile Settings", subtitle: "Manage your account details and preferences." },
  ];

  const pageMeta = ROUTE_META.find((r) => r.path === normalizedPath) || ROUTE_META[0];

  return (
    <DashboardLayout
      sidebar={sidebar}
      title={pageMeta.title}
      subtitle={pageMeta.subtitle}
      role="manager"
      name={name}
      profilePhoto={profilePhoto}
      onProfileUpload={handleProfilePhotoUpload}
      extraActions={extraActions}
      className="manager-dashboard"
    >

        {showOverview ? (
          <section className="manager-dashboard-content">
            {loading && (
              <div className="manager-state-card">
                <FontAwesomeIcon icon={faSpinner} spin />
                <h2>Loading Manager Dashboard</h2>
                <p>Please wait while the executive monitoring dashboard loads.</p>
              </div>
            )}

            {error && (
              <div className="manager-alert warning">
                <div>
                  <FontAwesomeIcon icon={faExclamationTriangle} />
                  <span>{error}</span>
                </div>

                <button type="button" onClick={() => fetchDashboardData()}>
                  Retry
                </button>
              </div>
            )}

            <section className="manager-hero">
              <div className="manager-hero-copy">
                <span className="manager-eyebrow">Executive Summary</span>
                <h2>Business monitoring, reservations, services, payments, inventory, and reports overview.</h2>
                <p>
                  This executive monitoring dashboard provides a comprehensive view of Pawesome operations,
                  including reservations, veterinary services, grooming, hotel/boarding, payments, inventory,
                  customers, staff performance, and business reports.
                </p>
                <small>
                  Last updated: {lastUpdated || "Not refreshed yet"}
                </small>
              </div>

              <div className="manager-hero-panel">
                <div>
                  <span>Total Revenue</span>
                  <strong>{formatCurrency(dashboardStats.totalSales)}</strong>
                  <small>Overall business revenue</small>
                </div>

                <button
                  type="button"
                  onClick={() => navigate("/manager/reports")}
                >
                  View Reports
                  <FontAwesomeIcon icon={faArrowRight} />
                </button>
              </div>
            </section>

            <section className="manager-summary-grid">
              {summaryCards.map((card) => (
                <article
                  className={`manager-stat-card ${card.tone}`}
                  key={card.title}
                >
                  <span className="manager-stat-icon">
                    <FontAwesomeIcon icon={card.icon} />
                  </span>

                  <div>
                    <strong>{card.value}</strong>
                    <p>{card.title}</p>
                    <small>{card.subtitle}</small>
                  </div>
                </article>
              ))}
            </section>

            <section className="manager-quick-actions">
              {quickActions.map((action) => (
                <button
                  type="button"
                  className="manager-action-card"
                  key={action.title}
                  onClick={() => navigate(action.path)}
                >
                  <span>
                    <FontAwesomeIcon icon={action.icon} />
                  </span>

                  <div>
                    <strong>{action.title}</strong>
                    <small>{action.description}</small>
                  </div>

                  <FontAwesomeIcon icon={faArrowRight} />
                </button>
              ))}
            </section>

            <section className="manager-overview-grid">
              <article className="manager-panel manager-panel-large">
                <PanelHeader
                  eyebrow="Recent Payments"
                  title="Latest Payment Transactions"
                  actionLabel="View All"
                  onAction={() => navigate("/manager/reports")}
                />

                {recentPayments.length === 0 ? (
                  <EmptyPanel
                    icon={faMoneyBill}
                    title="No recent payments"
                    message="No payment transactions are available yet."
                  />
                ) : (
                  <div className="manager-record-list">
                    {recentPayments.map((payment, index) => {
                      const status = normalizeStatus(payment.status || payment.payment_status);
                      const amount = toNumber(payment.amount || payment.total_amount || 0);

                      return (
                        <div
                          className="manager-record-item"
                          key={recordKey("payment", payment, index)}
                        >
                          <div className="manager-record-main">
                            <span className="manager-avatar">
                              {payment.customer_name?.charAt(0).toUpperCase() || "C"}
                            </span>

                            <div>
                              <strong>{payment.customer_name || "Customer"}</strong>
                              <small>{payment.payment_type || payment.payment_method || "N/A"}</small>
                            </div>
                          </div>

                          <div>
                            <span>{formatCurrency(amount)}</span>
                            <small className={`manager-text-status ${status}`}>
                              {formatStatusLabel(status)}
                            </small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>

              <article className="manager-panel">
                <PanelHeader
                  eyebrow="Revenue Summary"
                  title="Business Revenue Overview"
                  actionLabel="View Reports"
                  onAction={() => navigate("/manager/reports")}
                />

                <div className="manager-payroll-summary">
                  <div>
                    <small>Total Revenue</small>
                    <strong>{formatCurrency(revenueTotals.totalRevenue)}</strong>
                  </div>

                  <div>
                    <small>Today's Revenue</small>
                    <strong>{formatCurrency(revenueTotals.todayRevenue)}</strong>
                  </div>

                  <div>
                    <small>Monthly Revenue</small>
                    <strong>{formatCurrency(revenueTotals.monthlyRevenue)}</strong>
                  </div>
                </div>

                <div className="manager-compact-list">
                  <div className="manager-compact-item">
                    <div>
                      <strong>Approved Orders</strong>
                      <small>Orders approved by receptionist</small>
                    </div>
                    <span>{revenueTotals.approvedOrders}</span>
                  </div>
                  <div className="manager-compact-item">
                    <div>
                      <strong>Rejected Orders</strong>
                      <small>Orders rejected or cancelled</small>
                    </div>
                    <span>{revenueTotals.rejectedOrders}</span>
                  </div>
                </div>
              </article>
            </section>

            <section className="manager-overview-grid">
              <article className="manager-panel manager-panel-large">
                <PanelHeader
                  eyebrow="Recent Bookings"
                  title="Latest Service Requests"
                  actionLabel="View All"
                  onAction={() => navigate("/manager/reports")}
                />

                {recentBookings.length === 0 ? (
                  <EmptyPanel
                    icon={faCalendarCheck}
                    title="No recent bookings"
                    message="No service requests are available yet."
                  />
                ) : (
                  <div className="manager-record-list">
                    {recentBookings.map((booking, index) => {
                      const status = normalizeStatus(booking.status || booking.request_status);
                      const serviceType = booking.request_type || booking.service_name || "Service";

                      return (
                        <div
                          className="manager-record-item"
                          key={recordKey("booking", booking, index)}
                        >
                          <div className="manager-record-main">
                            <span className="manager-avatar">
                              {serviceType.charAt(0).toUpperCase()}
                            </span>

                            <div>
                              <strong>{serviceType}</strong>
                              <small>{booking.customer_name || booking.pet_name || "N/A"}</small>
                            </div>
                          </div>

                          <span className={`manager-status-badge ${status}`}>
                            {formatStatusLabel(status)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>

              <article className="manager-panel">
                <PanelHeader
                  eyebrow="Low Stock Alert"
                  title="Items Needing Restock"
                  actionLabel="View Inventory"
                  onAction={() => navigate("/manager/reports")}
                />

                {lowStockItems.length === 0 ? (
                  <EmptyPanel
                    icon={faCheck}
                    title="Stock levels healthy"
                    message="No items are currently below reorder level."
                  />
                ) : (
                  <div className="manager-compact-list">
                    {lowStockItems.map((item, index) => {
                      const stock = toNumber(item.stock || item.quantity || 0);
                      const reorderLevel = toNumber(item.reorder_level || item.min_stock || 0);

                      return (
                        <div
                          className="manager-compact-item"
                          key={recordKey("inventory", item, index)}
                        >
                          <div>
                            <strong>{item.name || item.item_name || "Item"}</strong>
                            <small>Stock: {stock} / Reorder at: {reorderLevel}</small>
                          </div>

                          <span className={`manager-text-status ${stock <= reorderLevel ? "danger" : "success"}`}>
                            {stock <= reorderLevel ? "Low" : "OK"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            </section>

            <section className="manager-panel">
              <PanelHeader
                eyebrow="Audit Trail"
                title="Recent Manager Activity"
                actionLabel="View History"
                onAction={() => navigate("/manager/history")}
              />

              {recentActivity.length === 0 ? (
                <EmptyPanel
                  icon={faHistory}
                  title="No recent activity"
                  message="Manager action history will appear here once available."
                />
              ) : (
                <div className="manager-activity-list">
                  {recentActivity.map((activity, index) => (
                    <div
                      className="manager-activity-item"
                      key={recordKey("activity", activity, index)}
                    >
                      <span>
                        <FontAwesomeIcon icon={faClipboardList} />
                      </span>

                      <div>
                        <strong>
                          {activity.action ||
                            activity.type ||
                            activity.event ||
                            "Manager Action"}
                        </strong>
                        <p>
                          {activity.description ||
                            activity.remarks ||
                            activity.message ||
                            "No description provided."}
                        </p>
                        <small>
                          {formatDateTime(
                            activity.created_at ||
                              activity.date ||
                              activity.timestamp
                          )}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {toast && (
              <div className={`manager-toast ${toast.type}`}>
                <FontAwesomeIcon
                  icon={toast.type === "error" ? faExclamationTriangle : faCheck}
                />
                <span>{toast.message}</span>
              </div>
            )}
          </section>
        ) : (
          <section className="manager-dashboard-content">
            <Outlet />
          </section>
        )}
    </DashboardLayout>
  );
};

const PanelHeader = ({ eyebrow, title, actionLabel, onAction }) => (
  <div className="manager-panel-header">
    <div>
      <span className="manager-eyebrow">{eyebrow}</span>
      <h3>{title}</h3>
    </div>

    {actionLabel && (
      <button type="button" onClick={onAction}>
        {actionLabel}
        <FontAwesomeIcon icon={faArrowRight} />
      </button>
    )}
  </div>
);

const EmptyPanel = ({ icon, title, message }) => (
  <div className="manager-empty-state">
    <FontAwesomeIcon icon={icon} />
    <h4>{title}</h4>
    <p>{message}</p>
  </div>
);

export default ManagerDashboard;
