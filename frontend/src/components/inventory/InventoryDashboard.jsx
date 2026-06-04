import { useState, useEffect } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { showError } from "../../utils/alert";
import { useAuth } from "../../context/AuthContext";
import StatusDot from "../shared/StatusDot";
import {
  faMoon,
  faSun,
  faCalendarAlt,
  faBox,
} from "@fortawesome/free-solid-svg-icons";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import InventorySidebar from "./InventorySidebar";
import DashboardLayout from "../shared/DashboardLayout";
import { apiRequest, uploadProfilePhoto } from "../../api/client";
import { useTheme } from "../../utils/theme";
import "./InventoryDashboard.css";

const InventoryDashboard = () => {
  const { user, updateUser } = useAuth();
  const name = user?.name || "Inventory Manager";
  const profilePhoto = user?.profile_photo || "";

  const { theme, toggle } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardError, setDashboardError] = useState("");
  const location = useLocation();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const handleProfilePhotoUpload = async (file) => {
    try {
      const data = await uploadProfilePhoto(file);
      const photoUrl = data?.profile_photo || data?.url || "";
      if (photoUrl) updateUser({ profile_photo: photoUrl });
    } catch (err) {
      showError("Failed to upload profile photo: " + err.message);
    }
  };

  const normalizedPath = location.pathname.replace(/\/+$/, "");
  const showOverview = normalizedPath === "/inventory";

  // Fetch dashboard data from backend
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const data = await apiRequest("/inventory/dashboard");
        if (data && data.total_items !== undefined) {
          setDashboardData(data);
          setDashboardError("");
        } else {
          setDashboardData(null);
          setDashboardError("No live inventory dashboard data found.");
        }
      } catch (err) {
        setDashboardData(null);
        setDashboardError(err.message || "Failed to load live inventory dashboard data.");
      }
    };

    if (showOverview) {
      fetchDashboardData();
      
      // Auto-refresh every 30 seconds for live data
      const interval = setInterval(() => {
        fetchDashboardData();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [showOverview]);

  const summaryCards = dashboardData ? [
    {
      title: "Total Products",
      value: dashboardData.total_items || 0,
      subtitle: "In inventory",
      change: "",
    },
    {
      title: "Low Stock Items",
      value: dashboardData.low_stock_items || 0,
      subtitle: "Need reorder",
      change: "",
    },
    {
      title: "Out of Stock",
      value: dashboardData.out_of_stock_items || 0,
      subtitle: "Items",
      change: "",
    },
  ] : [];

  const recentActivity = dashboardData ? (dashboardData.recent_transactions || []).map((transaction) => ({
    action: transaction.action || "Transaction",
    product: transaction.item_name || "Item",
    quantity: transaction.quantity || 0,
    time: transaction.created_at ? new Date(transaction.created_at).toLocaleDateString() : 'N/A',
    status: transaction.status || "completed",
  })) : [];

  // Chart data
  const stockChartData = [
    {
      name: "In Stock",
      value: Math.max(0, (dashboardData?.total_items || 0) - (dashboardData?.low_stock_items || 0) - (dashboardData?.out_of_stock_items || 0)),
    },
    {
      name: "Low Stock",
      value: dashboardData?.low_stock_items || 0,
    },
    {
      name: "Out of Stock",
      value: dashboardData?.out_of_stock_items || 0,
    },
  ];

  const stockPieData = [
    {
      name: "Available",
      value:
        (dashboardData?.total_items || 0) -
        (dashboardData?.low_stock_items || 0) -
        (dashboardData?.out_of_stock_items || 0),
    },
    {
      name: "Low Stock",
      value: dashboardData?.low_stock_items || 0,
    },
    {
      name: "Out of Stock",
      value: dashboardData?.out_of_stock_items || 0,
    },
  ].filter((item) => item.value > 0);

  const pieColors = ["#22c55e", "#f59e0b", "#ef4444"];

  const inventoryDashboardClasses = [
    "inventory-dashboard",
    sidebarCollapsed ? "collapsed" : "",
    theme === "dark" ? "dark" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const sidebar = (
    <InventorySidebar
      collapsed={sidebarCollapsed}
      onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
    />
  );

  const extraActions = (
    <button
      className="theme-toggle-btn"
      type="button"
      onClick={toggle}
    >
      <FontAwesomeIcon icon={theme === "light" ? faMoon : faSun} />
    </button>
  );

  return (
    <DashboardLayout
      sidebar={sidebar}
      title="Inventory Management"
      subtitle="Monitor stock levels and manage warehouse operations"
      role="inventory"
      name={name}
      profilePhoto={profilePhoto}
      onProfileUpload={handleProfilePhotoUpload}
      extraActions={extraActions}
      showChatbot
      chatbotTitle="Inventory Assistant"
      chatbotSubtitle="Stock guidance, navigation, and inventory help"
      className={inventoryDashboardClasses}
    >

        {showOverview ? (
          <>
            <section className="overview-cards">
              {dashboardError && (
                <div className="overview-card">
                  <div>
                    <h3>No records</h3>
                    <p>{dashboardError}</p>
                  </div>
                </div>
              )}
              {summaryCards.map((card) => (
                <div key={card.title} className="overview-card">
                  <div>
                    <h3>{card.value}</h3>
                    <p>{card.title}</p>
                  </div>
                  <span>{card.change}</span>
                </div>
              ))}
            </section>

            <section className="dashboard-grid">
              <article className="panel overview-panel">
                <div className="panel-header">
                  <div>
                    <h2>Recent Activity</h2>
                    <p>Latest inventory movements and updates</p>
                  </div>
                  <span className="badge">Live</span>
                </div>
                <div className="activity-list">
                  {recentActivity.map((activity, index) => (
                    <div key={index} className="activity-item">
                      <div className="activity-header">
                        <div className="activity-info">
                          <h3>{activity.action}</h3>
                          <p>{activity.product}</p>
                        </div>
                        <div className="activity-quantity">
                          <strong>{activity.quantity} units</strong>
                          <span className={`status-badge ${activity.status}`}>
                            {activity.status}
                          </span>
                        </div>
                      </div>
                      <div className="activity-details">
                        <span>
                          <FontAwesomeIcon icon={faBox} /> {activity.quantity} units
                        </span>
                        <span>
                          <FontAwesomeIcon icon={faCalendarAlt} /> {activity.time}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel quick-stat-panel">
                <div className="metric-card accent">
                  <h3>{dashboardData?.expiring_soon || 0}</h3>
                  <p>Expiring Soon</p>
                  <small>Within 30 days</small>
                </div>

                <div className="metric-card">
                  <h3>{dashboardData?.low_stock_items || 0}</h3>
                  <p>Low Stock Alerts</p>
                </div>

                <div className="metric-card">
                  <h3>{dashboardData?.inventory_changes_today || 0}</h3>
                  <p>Changes Today</p>
                </div>
              </article>
            </section>

            <section className="dashboard-bottom">
              <div className="panel stock-panel">
                <div className="panel-header space-between">
                  <div>
                    <h2>Stock Status</h2>
                  </div>
                  <NavLink to="/inventory/stock" className="see-all-link">
                    View all products
                  </NavLink>
                </div>

                <div className="stock-categories">
                  {(dashboardData?.critical_items || []).slice(0, 3).map((item, idx) => (
                    <div key={idx} className="stock-category-item">
                      <div className="category-icon">
                        <FontAwesomeIcon icon={faBox} />
                      </div>
                      <div className="category-info">
                        <h4>{item.name}</h4>
                        <p>{item.stock} units remaining</p>
                      </div>
                      <div className="category-status">
                        <StatusDot
                          status={item.stock === 0 ? "out_of_stock" : item.stock <= item.reorder_level ? "low_stock" : "in_stock"}
                        />
                      </div>
                    </div>
                  ))}
                  {(dashboardData?.critical_items || []).length === 0 && (
                    <p className="no-data">No critical stock items</p>
                  )}
                </div>
              </div>

              <div className="panel performance-panel">
                <div className="panel-header space-between">
                  <div>
                    <h2>Inventory Analytics</h2>
                  </div>
                  <NavLink to="/inventory/reports" className="see-all-link">
                    View reports
                  </NavLink>
                </div>
                
                <div className="inventory-analytics-grid">
                  <div className="analytics-chart-card">
                    <h4>Stock Overview</h4>
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height={210}>
                        <BarChart data={stockChartData}>
                          <XAxis dataKey="name" />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="value" radius={[10, 10, 0, 0]} fill="#ff5f93" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="analytics-chart-card">
                    <h4>Stock Health</h4>

                    {stockPieData.length > 0 ? (
                      <div className="chart-box">
                        <ResponsiveContainer width="100%" height={210}>
                          <PieChart>
                            <Pie
                              data={stockPieData}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={52}
                              outerRadius={78}
                              paddingAngle={4}
                            >
                              {stockPieData.map((entry, index) => (
                                <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="chart-empty">No stock data yet</div>
                    )}
                  </div>
                </div>

              </div>
            </section>
          </>
        ) : (
          <section className="dashboard-content">
            <Outlet />
          </section>
        )}
    </DashboardLayout>
  );
};

export default InventoryDashboard;
