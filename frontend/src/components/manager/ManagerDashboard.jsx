import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faCalendarAlt,
  faChartLine,
  faCheck,
  faClipboardList,
  faClock,
  faExclamationTriangle,
  faHistory,
  faMoneyBill,
  faMoon,
  faRefresh,
  faSpinner,
  faSun,
  faTimes,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { useTheme } from "../../utils/theme";
import { useAuth } from "../../context/AuthContext";
import ManagerSidebar from "./ManagerSidebar";
import DashboardLayout from "../shared/DashboardLayout";
import "./ManagerDashboard.css";

const DEFAULT_STATS = {
  totalEmployees: 0,
  presentToday: 0,
  lateToday: 0,
  absentToday: 0,
  pendingReviews: 0,
  currentPayrollTotal: 0,
  payrollPendingApproval: 0,
  payrollReleased: 0,
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

const buildStatsFromData = (dashboardData, attendanceList, payrollList) => {
  const pendingAttendance = attendanceList.filter((item) => {
    const reviewStatus = normalizeStatus(
      item.review_status || item.manager_review_status || item.reviewed_status
    );

    return (
      reviewStatus === "pending" ||
      reviewStatus === "unreviewed" ||
      item.reviewed === false ||
      item.is_reviewed === false
    );
  }).length;

  const presentToday = attendanceList.filter(
    (item) => normalizeStatus(item.status) === "present"
  ).length;

  const lateToday = attendanceList.filter(
    (item) => normalizeStatus(item.status) === "late"
  ).length;

  const absentToday = attendanceList.filter(
    (item) => normalizeStatus(item.status) === "absent"
  ).length;

  const payrollPendingApproval = payrollList.filter((item) =>
    ["pending", "pending_review", "for_approval", "draft"].includes(
      normalizeStatus(item.status || item.payroll_status)
    )
  ).length;

  const payrollReleased = payrollList.filter((item) =>
    ["released", "paid"].includes(normalizeStatus(item.status || item.payroll_status))
  ).length;

  const currentPayrollTotal = payrollList.reduce(
    (sum, item) =>
      sum +
      toNumber(
        item.net_pay ||
          item.total_net_pay ||
          item.amount ||
          item.total_amount ||
          item.gross_pay
      ),
    0
  );

  return {
    totalEmployees:
      toNumber(dashboardData.total_employees) ||
      toNumber(dashboardData.total_staff) ||
      new Set(attendanceList.map((item) => getEmployeeName(item))).size ||
      payrollList.length,
    presentToday: toNumber(dashboardData.present_today) || presentToday,
    lateToday: toNumber(dashboardData.late_today) || lateToday,
    absentToday: toNumber(dashboardData.absent_today) || absentToday,
    pendingReviews:
      toNumber(dashboardData.pending_reviews) ||
      toNumber(dashboardData.pending_attendance_reviews) ||
      pendingAttendance,
    currentPayrollTotal:
      toNumber(dashboardData.current_payroll_total) ||
      toNumber(dashboardData.total_payroll) ||
      currentPayrollTotal,
    payrollPendingApproval:
      toNumber(dashboardData.payroll_pending_approval) || payrollPendingApproval,
    payrollReleased: toNumber(dashboardData.payroll_released) || payrollReleased,
  };
};

const ManagerDashboard = () => {
  const { user } = useAuth();
  const name = user?.name || "Manager";
  const profilePhoto = user?.profile_photo || "";

  const { theme, toggle } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [lastUpdated, setLastUpdated] = useState("");

  const [dashboardStats, setDashboardStats] = useState(DEFAULT_STATS);
  const [todayAttendance, setTodayAttendance] = useState([]);
  const [payrollPeriod, setPayrollPeriod] = useState([]);
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

      // Refresh user data via auth context if needed
      showToast("Profile photo updated successfully.", "success");

      window.setTimeout(() => {
        window.location.reload();
      }, 700);
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

        const [
          dashboardResponse,
          attendanceResponse,
          payrollResponse,
          historyResponse,
        ] = await Promise.all([
          apiRequest("/manager/dashboard").catch(() => null),
          apiRequest("/manager/attendance").catch(() => null),
          apiRequest("/manager/payroll").catch(() => null),
          apiRequest("/manager/history").catch(() => null),
        ]);

        const dashboardData = dashboardResponse?.data || dashboardResponse || {};

        const attendanceList = normalizeList(attendanceResponse, [
          "attendance",
          "records",
          "items",
        ]);

        const payrollList = normalizeList(payrollResponse, [
          "payroll",
          "records",
          "items",
        ]);

        const historyList = normalizeList(historyResponse, [
          "history",
          "activities",
          "logs",
          "records",
        ]);

        setDashboardStats(
          buildStatsFromData(dashboardData, attendanceList, payrollList)
        );

        setTodayAttendance(attendanceList.slice(0, 6));
        setPayrollPeriod(payrollList.slice(0, 6));
        setRecentActivity(historyList.slice(0, 6));
        setLastUpdated(new Date().toLocaleString("en-PH"));

        if (!dashboardResponse && !attendanceResponse && !payrollResponse) {
          setError(
            "No manager dashboard endpoint returned data yet. The dashboard is ready, but backend data still needs to be connected."
          );
        }
      } catch (err) {
        console.error("Manager dashboard fetch error:", err);
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
        title: "Total Employees",
        value: dashboardStats.totalEmployees,
        subtitle: "Active workforce",
        icon: faUsers,
        tone: "primary",
      },
      {
        title: "Present Today",
        value: dashboardStats.presentToday,
        subtitle: "On duty today",
        icon: faCheck,
        tone: "success",
      },
      {
        title: "Late Today",
        value: dashboardStats.lateToday,
        subtitle: "Late arrivals",
        icon: faClock,
        tone: "warning",
      },
      {
        title: "Absent Today",
        value: dashboardStats.absentToday,
        subtitle: "Not present",
        icon: faTimes,
        tone: "danger",
      },
      {
        title: "Pending Reviews",
        value: dashboardStats.pendingReviews,
        subtitle: "Attendance needing review",
        icon: faExclamationTriangle,
        tone: "info",
      },
      {
        title: "Current Payroll",
        value: formatCurrency(dashboardStats.currentPayrollTotal),
        subtitle: "Current period estimate",
        icon: faMoneyBill,
        tone: "money",
      },
      {
        title: "Pending Approval",
        value: dashboardStats.payrollPendingApproval,
        subtitle: "Payroll records waiting",
        icon: faClock,
        tone: "warning",
      },
      {
        title: "Released Payroll",
        value: dashboardStats.payrollReleased,
        subtitle: "Released payments",
        icon: faCheck,
        tone: "success",
      },
    ],
    [dashboardStats]
  );

  const quickActions = [
    {
      title: "View Attendance",
      description: "Review daily employee attendance records.",
      icon: faCalendarAlt,
      path: "/manager/attendance",
    },
    {
      title: "Manage Payroll",
      description: "Monitor payroll periods and payroll status.",
      icon: faMoneyBill,
      path: "/manager/payroll",
    },
    {
      title: "View Reports",
      description: "Open attendance and payroll reports.",
      icon: faChartLine,
      path: "/manager/reports",
    },
    {
      title: "View History",
      description: "Review manager activity and audit trail.",
      icon: faHistory,
      path: "/manager/history",
    },
  ];

  const payrollTotals = useMemo(() => {
    const totalNetPay = payrollPeriod.reduce(
      (sum, item) =>
        sum +
        toNumber(
          item.net_pay ||
            item.total_net_pay ||
            item.amount ||
            item.total_amount ||
            item.gross_pay
        ),
      0
    );

    const approved = payrollPeriod.filter((item) =>
      ["approved", "released", "paid"].includes(
        normalizeStatus(item.status || item.payroll_status)
      )
    ).length;

    const pending = payrollPeriod.filter((item) =>
      ["pending", "pending_review", "for_approval", "draft"].includes(
        normalizeStatus(item.status || item.payroll_status)
      )
    ).length;

    return {
      totalNetPay,
      approved,
      pending,
    };
  }, [payrollPeriod]);

  const sidebar = (
    <ManagerSidebar
      collapsed={sidebarCollapsed}
      onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
    />
  );

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
      <button
        className="manager-icon-btn"
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
      sidebar={sidebar}
      title="Manager Dashboard"
      subtitle="Workforce, attendance, payroll, and reporting overview."
      role="manager"
      name={name}
      profilePhoto={profilePhoto}
      onProfileUpload={handleProfilePhotoUpload}
      extraActions={extraActions}
      className={`manager-dashboard ${sidebarCollapsed ? "collapsed" : ""}`}
    >

        {showOverview ? (
          <section className="manager-dashboard-content">
            {loading ? (
              <div className="manager-state-card">
                <FontAwesomeIcon icon={faSpinner} spin />
                <h2>Loading manager dashboard</h2>
                <p>Please wait while the workforce and payroll overview loads.</p>
              </div>
            ) : (
              <>
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
                    <span className="manager-eyebrow">Workforce & Payroll Overview</span>
                    <h2>Monitor attendance, payroll readiness, and staff activity.</h2>
                    <p>
                      This dashboard gives the manager a clear overview of daily
                      attendance, pending reviews, payroll status, and recent
                      workforce-related activity.
                    </p>
                    <small>
                      Last updated: {lastUpdated || "Not refreshed yet"}
                    </small>
                  </div>

                  <div className="manager-hero-panel">
                    <div>
                      <span>Payroll Estimate</span>
                      <strong>{formatCurrency(dashboardStats.currentPayrollTotal)}</strong>
                      <small>Current payroll period</small>
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate("/manager/payroll")}
                    >
                      Open Payroll
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
                      eyebrow="Daily Attendance"
                      title="Today's Attendance Snapshot"
                      actionLabel="View All"
                      onAction={() => navigate("/manager/attendance")}
                    />

                    {todayAttendance.length === 0 ? (
                      <EmptyPanel
                        icon={faClipboardList}
                        title="No attendance records"
                        message="No employee attendance records are available for today."
                      />
                    ) : (
                      <div className="manager-record-list">
                        {todayAttendance.map((record, index) => {
                          const status = normalizeStatus(record.status);

                          return (
                            <div
                              className="manager-record-item"
                              key={record.id || record.attendance_id || index}
                            >
                              <div className="manager-record-main">
                                <span className="manager-avatar">
                                  {getEmployeeName(record).charAt(0).toUpperCase()}
                                </span>

                                <div>
                                  <strong>{getEmployeeName(record)}</strong>
                                  <small>{getEmployeeRole(record)}</small>
                                </div>
                              </div>

                              <div className="manager-time-group">
                                <span>In: {formatTime(record.time_in)}</span>
                                <span>Out: {formatTime(record.time_out)}</span>
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
                      eyebrow="Payroll"
                      title="Payroll Period Snapshot"
                      actionLabel="View All"
                      onAction={() => navigate("/manager/payroll")}
                    />

                    <div className="manager-payroll-summary">
                      <div>
                        <small>Visible Net Pay</small>
                        <strong>{formatCurrency(payrollTotals.totalNetPay)}</strong>
                      </div>

                      <div>
                        <small>Approved / Released</small>
                        <strong>{payrollTotals.approved}</strong>
                      </div>

                      <div>
                        <small>Pending Review</small>
                        <strong>{payrollTotals.pending}</strong>
                      </div>
                    </div>

                    {payrollPeriod.length === 0 ? (
                      <EmptyPanel
                        icon={faMoneyBill}
                        title="No payroll records"
                        message="No payroll period records are available yet."
                      />
                    ) : (
                      <div className="manager-compact-list">
                        {payrollPeriod.map((payroll, index) => {
                          const status = normalizeStatus(
                            payroll.status || payroll.payroll_status
                          );

                          return (
                            <div
                              className="manager-compact-item"
                              key={payroll.id || payroll.payroll_id || index}
                            >
                              <div>
                                <strong>{getEmployeeName(payroll)}</strong>
                                <small>{getEmployeeRole(payroll)}</small>
                              </div>

                              <div>
                                <span>
                                  {formatCurrency(
                                    payroll.net_pay ||
                                      payroll.total_net_pay ||
                                      payroll.amount ||
                                      payroll.total_amount ||
                                      0
                                  )}
                                </span>
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
                          key={activity.id || activity.log_id || index}
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
              </>
            )}

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