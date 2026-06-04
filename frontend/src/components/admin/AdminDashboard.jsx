import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { showError } from "../../utils/alert";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Legend,
} from "recharts";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMoon,
  faSun,
  faUsers,
  faClipboardList,
  faCalendarCheck,
  faBoxOpen,
  faUserShield,
  faServer,
  faDatabase,
  faSync,
  faLayerGroup,
  faRotateRight,
  faExclamationTriangle,
  faChartLine,
  faChartPie,
  faMoneyBillWave,
  faArrowRight,
  faCircleCheck,
  faUserPlus,
  faGear,
  faFileLines,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";

import AdminSidebar from "./AdminSidebar";
import DashboardLayout from "../shared/DashboardLayout";
import "./AdminDashboard.css";
import { apiRequest, uploadProfilePhoto } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { normalizeList } from "../../utils/normalizeList";
import { useTheme } from "../../utils/theme";
import { useAuth } from "../../context/AuthContext";

const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

const chartColors = ["#ff5f93", "#ff8db5", "#ffc8dd", "#f472b6", "#fb7185", "#f59e0b"];

const AdminDashboard = () => {
  const { user, updateUser } = useAuth();
  const name = user?.name || "Admin";
  const profilePhoto = user?.profile_photo || "";

  const { theme, toggle } = useTheme();
  const [dashboardData, setDashboardData] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const location = useLocation();
  const normalizedPath = location.pathname.replace(/\/+$/, "");
  const showOverview = normalizedPath === "/admin";


  const handleProfilePhotoUpload = async (file) => {
    try {
      const data = await uploadProfilePhoto(file);
      const photoUrl = data?.profile_photo || data?.url || "";
      if (photoUrl) updateUser({ profile_photo: photoUrl });
    } catch (err) {
      showError("Failed to upload profile photo: " + err.message);
    }
  };

  const fetchDashboardData = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const [dashboardResult, healthResult] = await Promise.allSettled([
          apiRequest("/admin/dashboard"),
          apiRequest("/admin/system-health"),
        ]);

        if (dashboardResult.status === "rejected") {
          throw dashboardResult.reason;
        }

        setDashboardData(dashboardResult.value || {});
        setSystemHealth(
          healthResult.status === "fulfilled" ? healthResult.value || null : null
        );
        setLastUpdated(new Date().toLocaleString("en-PH"));
      } catch (err) {
        console.error("Admin dashboard fetch error:", err);
        setError(err.message || "Failed to load admin dashboard data.");
        showError(err.message || "Failed to load admin dashboard data.");
        setDashboardData({
          total_users: 0,
          active_users: 0,
          total_customers: 0,
          today_appointments: 0,
          total_revenue: 0,
          today_revenue: 0,
          low_stock_items: 0,
          total_appointments: 0,
          completed_appointments: 0,
          appointments_by_status: [],
          users_by_role: [],
          recent_appointments: [],
          recent_users: [],
        });
        setSystemHealth(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (showOverview) {
      fetchDashboardData();
    }
  }, [showOverview, fetchDashboardData]);

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return "Just now";

    const time = new Date(timestamp).getTime();
    if (Number.isNaN(time)) return "Recently";

    const diff = Date.now() - time;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const formatNumber = (value) =>
    new Intl.NumberFormat("en-PH").format(Number(value || 0));

  const dashboard = useMemo(() => dashboardData || {}, [dashboardData]);

  const appointmentStatusData = useMemo(() => {
    return normalizeList(dashboard?.appointments_by_status, [
      "data",
      "records",
      "items",
    ]).map((item) => ({
      status: item.status || item.name || item.label || "Unknown",
      count: Number(item.count || item.total || item.value || 0),
    }));
  }, [dashboard]);

  const userRoleData = useMemo(() => {
    return normalizeList(dashboard?.users_by_role, [
      "data",
      "records",
      "items",
    ]).map((item) => ({
      role: item.role || item.name || item.label || "Unknown",
      count: Number(item.count || item.total || item.value || 0),
    }));
  }, [dashboard]);

  const completionRate = dashboard?.total_appointments
    ? Math.round(
        ((dashboard.completed_appointments || 0) / dashboard.total_appointments) * 100
      )
    : 0;

  const activeUserRate = dashboard?.total_users
    ? Math.round(((dashboard.active_users || 0) / dashboard.total_users) * 100)
    : 0;

  const pendingAppointments = Math.max(
    (dashboard?.total_appointments || 0) - (dashboard?.completed_appointments || 0),
    0
  );

  const summaryCards = useMemo(
    () => [
      {
        title: "Total Users",
        value: formatNumber(dashboard.total_users || 0),
        subtitle: "Registered platform accounts",
        icon: faUsers,
        color: "primary",
      },
      {
        title: "Active Users",
        value: formatNumber(dashboard.active_users || 0),
        subtitle: `${activeUserRate}% active user rate`,
        icon: faUserShield,
        color: "success",
      },
      {
        title: "Total Customers",
        value: formatNumber(dashboard.total_customers || 0),
        subtitle: "Customer records",
        icon: faUsers,
        color: "info",
      },
      {
        title: "Today’s Appointments",
        value: formatNumber(dashboard.today_appointments || 0),
        subtitle: "Scheduled for today",
        icon: faCalendarCheck,
        color: "warning",
      },
      {
        title: "Total Revenue",
        value: formatCurrency(dashboard.total_revenue || 0),
        subtitle: `Today: ${formatCurrency(dashboard.today_revenue || 0)}`,
        icon: faMoneyBillWave,
        color: "primary",
      },
      {
        title: "Low Stock Items",
        value: formatNumber(dashboard.low_stock_items || 0),
        subtitle: "Inventory items needing attention",
        icon: faBoxOpen,
        color: Number(dashboard.low_stock_items || 0) > 0 ? "danger" : "success",
      },
    ],
    [dashboard, activeUserRate]
  );

  const orderRequests = useMemo(() => {
    if (!dashboardData) return [];

    const appointments = normalizeList(dashboard.recent_appointments, [
      "data",
      "records",
      "items",
    ]).map((apt) => ({
      id: apt.id || `appointment-${apt.scheduled_at || Math.random()}`,
      name:
        apt.customer?.name ||
        apt.customer_name ||
        apt.owner_name ||
        "Unknown Customer",
      time: formatRelativeTime(apt.scheduled_at || apt.created_at),
      date: apt.scheduled_at
        ? new Date(apt.scheduled_at).toLocaleDateString("en-PH")
        : "N/A",
      service: apt.service?.name || apt.service_name || apt.service_type || "Service",
      pet: apt.pet?.name || apt.pet_name || "Pet",
      status: apt.status || "scheduled",
      type: "appointment",
    }));

    const users = normalizeList(dashboard.recent_users, [
      "data",
      "records",
      "items",
    ]).map((user) => ({
      id: user.id || `user-${user.email || Math.random()}`,
      name: user.name || user.username || user.email || "New User",
      time: formatRelativeTime(user.created_at),
      date: user.created_at
        ? new Date(user.created_at).toLocaleDateString("en-PH")
        : "N/A",
      role: user.role || "user",
      status: user.is_active === false ? "inactive" : "active",
      type: "user",
    }));

    return [...appointments, ...users].slice(0, 8);
  }, [dashboardData, dashboard]);

  const health = systemHealth?.health || systemHealth || {};
  const backendStatus =
    health?.backend?.status || systemHealth?.backend_status || "unknown";
  const databaseStatus =
    health?.database?.status || systemHealth?.database_status || "unknown";
  const activeModules = health?.active_modules || systemHealth?.active_modules || {};

  const activeModuleCount = Object.keys(activeModules).filter(
    (key) => activeModules[key]
  ).length;

  const systemStatusItems = [
    {
      title: "Backend",
      value: backendStatus,
      icon: faServer,
      online:
        String(backendStatus).toLowerCase() === "operational" ||
        String(backendStatus).toLowerCase() === "online",
    },
    {
      title: "Database",
      value: databaseStatus,
      icon: faDatabase,
      online:
        String(databaseStatus).toLowerCase() === "connected" ||
        String(databaseStatus).toLowerCase() === "online",
    },
    {
      title: "Last Sync",
      value: systemHealth?.timestamp
        ? new Date(systemHealth.timestamp).toLocaleTimeString("en-PH")
        : lastUpdated || "Not available",
      icon: faSync,
      online: Boolean(systemHealth?.timestamp || lastUpdated),
    },
    {
      title: "Active Modules",
      value: activeModuleCount || dashboard.active_modules || "N/A",
      icon: faLayerGroup,
      online: activeModuleCount > 0 || Boolean(dashboard.active_modules),
    },
  ];

  const quickActions = [
    {
      label: "Manage Users",
      description: "Create, edit, and monitor role access.",
      to: "/admin/users",
      icon: faUserPlus,
    },
    {
      label: "View Reports",
      description: "Open admin reports and analytics.",
      to: "/admin/reports",
      icon: faFileLines,
    },
    {
      label: "System Settings",
      description: "Review platform configuration.",
      to: "/admin/settings",
      icon: faGear,
    },
  ];

  const ROUTE_META = [
    { path: "/admin", title: "Admin Command Center", subtitle: "Monitor users, appointments, revenue, inventory alerts, and system health in one professional workspace." },
    { path: "/admin/profile", title: "Profile Settings", subtitle: "Manage your account details and preferences." },
    { path: "/admin/users/create", title: "Create User", subtitle: "Add a new user to the system with role-based access." },
    { path: "/admin/users", title: "Manage Users", subtitle: "Create, edit, and monitor role access across the platform." },
    { path: "/admin/reports/cashier", title: "Cashier Reports", subtitle: "Review cashier sales, transactions, and revenue data." },
    { path: "/admin/reports/inventory", title: "Inventory Reports", subtitle: "Track stock levels, product movement, and warehouse metrics." },
    { path: "/admin/reports/manager", title: "Manager Reports", subtitle: "View workforce, attendance, and payroll summaries." },
    { path: "/admin/reports/veterinary", title: "Veterinary Reports", subtitle: "Access patient records, appointments, and vet service data." },
    { path: "/admin/reports/customers", title: "Customer Reports", subtitle: "Analyze customer activity, bookings, and engagement." },
    { path: "/admin/reports/payments", title: "Payment Reports", subtitle: "Review payment transactions and revenue breakdowns." },
    { path: "/admin/reports/orders", title: "Order Reports", subtitle: "Analyze order volume, status, and fulfillment metrics." },
    { path: "/admin/reports/services", title: "Service Reports", subtitle: "Review service requests, approvals, and completion rates." },
    { path: "/admin/reports/logistics", title: "Logistics Reports", subtitle: "Track supply chain, deliveries, and logistics performance." },
    { path: "/admin/reports/reception", title: "Reception Reports", subtitle: "Review front desk bookings, check-ins, and customer flow." },
    { path: "/admin/reports/attendance", title: "Attendance Reports", subtitle: "Monitor staff attendance, punctuality, and absences." },
    { path: "/admin/reports", title: "Reports", subtitle: "Central hub for all role-based reports and analytics." },
    { path: "/admin/history", title: "Activity History", subtitle: "View system-wide logs and recent changes." },
    { path: "/admin/chatbot", title: "Chatbot Logs", subtitle: "Review AI assistant conversations and feedback." },
    { path: "/admin/settings", title: "System Settings", subtitle: "Configure platform preferences and global options." },
  ];

  const pageMeta = useMemo(() => {
    const exact = ROUTE_META.find((r) => r.path === normalizedPath);
    if (exact) return exact;
    const prefix = ROUTE_META.filter((r) => normalizedPath.startsWith(r.path + "/")).sort((a, b) => b.path.length - a.path.length)[0];
    return prefix || { title: "Admin Workspace", subtitle: "Manage platform operations with role-based access and live system context." };
  }, [normalizedPath]);

  const AdminTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;

    return (
      <div className="admin-chart-tooltip">
        <strong>{label}</strong>
        {payload.map((item) => (
          <p key={item.dataKey || item.name}>
            {item.name || item.dataKey}: {formatNumber(item.value)}
          </p>
        ))}
      </div>
    );
  };

  const extraActions = (
    <>
      {showOverview && (
        <button
          className={`admin-icon-btn admin-refresh-btn ${
            refreshing ? "refreshing" : ""
          }`}
          type="button"
          onClick={() => fetchDashboardData({ silent: true })}
          disabled={refreshing}
          title="Refresh dashboard"
        >
          <FontAwesomeIcon icon={refreshing ? faSpinner : faRotateRight} />
        </button>
      )}
      <button
        className="theme-toggle-btn"
        type="button"
        onClick={toggle}
        title="Toggle theme"
      >
        <FontAwesomeIcon icon={theme === "light" ? faMoon : faSun} />
      </button>
    </>
  );

  return (
    <DashboardLayout
      sidebar={<AdminSidebar />}
      title={pageMeta.title}
      subtitle={pageMeta.subtitle}
      role="admin"
      name={name}
      profilePhoto={profilePhoto}
      onProfileUpload={handleProfilePhotoUpload}
      extraActions={extraActions}
      showChatbot
      chatbotTitle="Admin Assistant"
      chatbotSubtitle="Logs, navigation, and RBAC guidance"
      className="admin-dashboard"
    >
      {showOverview ? (
        <>
            {loading ? (
              <div className="admin-loading-state">
                <FontAwesomeIcon icon={faSpinner} className="admin-spin" />
                <h3>Loading admin dashboard...</h3>
                <p>Please wait while we load live platform data.</p>
              </div>
            ) : error ? (
              <div className="admin-error-state">
                <FontAwesomeIcon icon={faExclamationTriangle} />
                <h3>Unable to load dashboard</h3>
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => fetchDashboardData()}
                  className="retry-btn"
                >
                  Retry
                </button>
              </div>
            ) : (
              <motion.div
                className="dashboard-motion-wrap"
                initial="hidden"
                animate="show"
                transition={{ staggerChildren: 0.08 }}
              >
                <motion.section className="admin-hero" variants={cardVariants}>
                  <div className="admin-hero-copy">
                    <span className="admin-eyebrow">
                      <FontAwesomeIcon icon={faUserShield} />
                      Administrator Overview
                    </span>
                    <h2>Welcome back, {name}</h2>
                    <p>
                      Track live operations, user activity, revenue, inventory alerts,
                      and system health from your admin command center.
                    </p>
                  </div>

                  <div className="admin-hero-actions">
                    <button
                      type="button"
                      className="admin-secondary-action"
                      onClick={() => fetchDashboardData({ silent: true })}
                      disabled={refreshing}
                    >
                      <FontAwesomeIcon icon={faRotateRight} />
                      {refreshing ? "Refreshing..." : "Refresh Data"}
                    </button>

                    <NavLink to="/admin/reports" className="admin-primary-action">
                      View Reports
                      <FontAwesomeIcon icon={faArrowRight} />
                    </NavLink>
                  </div>

                  <span className="admin-last-updated">
                    Last updated: {lastUpdated || "Not available"}
                  </span>
                </motion.section>

                <section className="overview-cards">
                  {summaryCards.map((card) => (
                    <motion.article
                      key={card.title}
                      className={`overview-card ${card.color}`}
                      variants={cardVariants}
                      whileHover={{ y: -6, scale: 1.01 }}
                    >
                      <div className="overview-card-top">
                        <span className="overview-card-icon">
                          <FontAwesomeIcon icon={card.icon} />
                        </span>
                        <span className="overview-card-dot" />
                      </div>

                      <h3>{card.value}</h3>
                      <p>{card.title}</p>
                      <small>{card.subtitle}</small>
                    </motion.article>
                  ))}
                </section>

                <section className="admin-quick-actions">
                  {quickActions.map((item) => (
                    <NavLink
                      key={item.label}
                      to={item.to}
                      className="admin-quick-action-card"
                    >
                      <span className="quick-action-icon">
                        <FontAwesomeIcon icon={item.icon} />
                      </span>
                      <div>
                        <strong>{item.label}</strong>
                        <p>{item.description}</p>
                      </div>
                      <FontAwesomeIcon icon={faArrowRight} />
                    </NavLink>
                  ))}
                </section>

                <section className="dashboard-grid">
                  <motion.article className="panel" variants={cardVariants}>
                    <div className="panel-header">
                      <div>
                        <h2>Appointment Status</h2>
                        <p>Visual breakdown of appointment progress.</p>
                      </div>
                      <span className="badge">
                        {formatNumber(dashboard.total_appointments || 0)} total
                      </span>
                    </div>

                    <div className="chart-box">
                      {appointmentStatusData.length === 0 ? (
                        <div className="admin-empty-chart">
                          <FontAwesomeIcon icon={faChartLine} />
                          <p>No appointment status data available.</p>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={appointmentStatusData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="status" />
                            <YAxis allowDecimals={false} />
                            <Tooltip content={<AdminTooltip />} />
                            <Bar dataKey="count" name="Appointments" radius={[10, 10, 0, 0]}>
                              {appointmentStatusData.map((entry, index) => (
                                <Cell
                                  key={entry.status}
                                  fill={chartColors[index % chartColors.length]}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </motion.article>

                  <motion.article className="panel quick-stat-panel" variants={cardVariants}>
                    <div className="metric-card accent">
                      <span className="metric-kicker">Daily Pulse</span>
                      <h3>{formatCurrency(dashboard.today_revenue || 0)}</h3>
                      <p>Revenue collected today</p>
                    </div>

                    <div className="metric-card">
                      <span className="metric-kicker">Service Flow</span>
                      <h3>{formatNumber(pendingAppointments)}</h3>
                      <p>Appointments still in progress</p>
                    </div>

                    <div className="metric-card">
                      <span className="metric-kicker">Staff Readiness</span>
                      <h3>{formatNumber(dashboard.active_users || 0)}</h3>
                      <p>Active dashboard accounts</p>
                    </div>

                    <div className="metric-card">
                      <span className="metric-kicker">System Status</span>
                      <h3>{backendStatus !== "unknown" ? "ONLINE" : "CHECK"}</h3>
                      <p>Backend and database monitoring</p>
                    </div>
                  </motion.article>
                </section>

                <section className="dashboard-grid three-column">
                  <motion.article className="panel" variants={cardVariants}>
                    <div className="panel-header">
                      <div>
                        <h2>Users by Role</h2>
                        <p>Role distribution across the system.</p>
                      </div>
                    </div>

                    <div className="chart-box">
                      {userRoleData.length === 0 ? (
                        <div className="admin-empty-chart">
                          <FontAwesomeIcon icon={faChartPie} />
                          <p>No role distribution data available.</p>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height={280}>
                          <PieChart>
                            <Pie
                              data={userRoleData}
                              dataKey="count"
                              nameKey="role"
                              outerRadius={95}
                              innerRadius={55}
                              paddingAngle={4}
                            >
                              {userRoleData.map((entry, index) => (
                                <Cell
                                  key={entry.role}
                                  fill={chartColors[index % chartColors.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </motion.article>

                  <motion.article className="panel" variants={cardVariants}>
                    <div className="panel-header">
                      <div>
                        <h2>Operations Snapshot</h2>
                        <p>Current performance indicators.</p>
                      </div>
                    </div>

                    <div className="completion-metrics">
                      <div className="status-card success">
                        <strong>{completionRate}%</strong>
                        <p>Completion Rate</p>
                      </div>
                      <div className="status-card info">
                        <strong>{formatNumber(dashboard.total_appointments || 0)}</strong>
                        <p>Total Appointments</p>
                      </div>
                      <div className="status-card danger">
                        <strong>{formatNumber(dashboard.low_stock_items || 0)}</strong>
                        <p>Low Stock Alerts</p>
                      </div>
                    </div>
                  </motion.article>

                  <motion.article className="panel" variants={cardVariants}>
                    <div className="panel-header">
                      <div>
                        <h2>System Status</h2>
                        <p>Platform health monitoring.</p>
                      </div>
                    </div>

                    <div className="system-status-grid">
                      {systemStatusItems.map((item) => (
                        <div className="system-status-item" key={item.title}>
                          <span className="system-status-icon">
                            <FontAwesomeIcon icon={item.icon} />
                          </span>
                          <div>
                            <strong>{item.title}</strong>
                            <p className={item.online ? "status-online" : "status-offline"}>
                              {item.value}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.article>
                </section>

                <section className="dashboard-bottom">
                  <motion.div className="panel orders-panel" variants={cardVariants}>
                    <div className="panel-header space-between">
                      <div>
                        <h2>Recent Operational Activity</h2>
                        <p>Latest appointments and user registrations.</p>
                      </div>
                      <NavLink to="/admin/reports" className="see-all-link">
                        View reports
                        <FontAwesomeIcon icon={faArrowRight} />
                      </NavLink>
                    </div>

                    <div className="request-list">
                      {orderRequests.length > 0 ? (
                        orderRequests.map((order) => (
                          <motion.div
                            key={`${order.type}-${order.id}`}
                            className="request-card"
                            whileHover={{ y: -4 }}
                          >
                            <div className="request-card-top">
                              <div>
                                <h3>{order.name}</h3>
                                <p>
                                  {order.time} • {order.date}
                                </p>
                              </div>
                              <span className={`status-badge ${order.status}`}>
                                {order.type === "appointment" ? order.status : order.role}
                              </span>
                            </div>

                            <div className="request-info">
                              {order.type === "appointment" ? (
                                <>
                                  <div>
                                    <strong>Service</strong>
                                    <p>{order.service}</p>
                                  </div>
                                  <div>
                                    <strong>Pet</strong>
                                    <p>{order.pet}</p>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div>
                                    <strong>Role</strong>
                                    <p>{order.role}</p>
                                  </div>
                                  <div>
                                    <strong>Status</strong>
                                    <p>{order.status}</p>
                                  </div>
                                </>
                              )}
                            </div>

                            <div className="request-footer">
                              <span>
                                <FontAwesomeIcon icon={faUsers} />{" "}
                                {order.type === "appointment" ? "Customer" : "New User"}
                              </span>
                              <span>
                                <FontAwesomeIcon icon={faClipboardList} />{" "}
                                {order.type}
                              </span>
                            </div>
                          </motion.div>
                        ))
                      ) : (
                        <div className="empty-panel-state">
                          <FontAwesomeIcon icon={faCircleCheck} />
                          <h3>System is running smoothly</h3>
                          <p>No new activity detected. All operations are stable.</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </section>
              </motion.div>
            )}
          </>
        ) : (
          <section className="dashboard-content">
            <Outlet />
          </section>
        )}
    </DashboardLayout>
  );
};

export default AdminDashboard;
