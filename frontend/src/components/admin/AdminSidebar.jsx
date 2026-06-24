import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartPie,
  faUsers,
  faUserPlus,
  faHistory,
  faKey,
  faComments,
  faChartBar,
  faMoneyBillWave,
  faCog,
  faEdit,
  faUserCircle,
  faSignOutAlt,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import { showConfirm } from "../../utils/alert.jsx";
import { apiRequest, clearAuthStorage } from "../../api/client";
import "./AdminSidebar.css";

const NAV_SECTIONS = [
  {
    label: "System",
    items: [
      { to: "/admin", label: "Dashboard", icon: faChartPie, end: true },
    ],
  },
  {
    label: "User Management",
    items: [
      { to: "/admin/users", label: "Manage Users", icon: faUsers },
      { to: "/admin/users/create", label: "Create User", icon: faUserPlus },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { to: "/admin/history", label: "Audit History", icon: faHistory },
      { to: "/admin/history/logins", label: "Login History", icon: faKey },
      { to: "/admin/chatbot", label: "Chatbot Logs", icon: faComments },
    ],
  },
  {
    label: "Reports",
    items: [
      { to: "/admin/reports", label: "All Reports", icon: faChartBar },
      { to: "/admin/reports/payroll", label: "Payroll Reports", icon: faMoneyBillWave },
    ],
  },
  {
    label: "System Tools",
    items: [
      { to: "/admin/settings", label: "Settings", icon: faCog },
      { to: "/admin/landing-page", label: "Landing Page Editor", icon: faEdit },
      { to: "/admin/profile", label: "Profile", icon: faUserCircle },
    ],
  },
];

const AdminSidebar = ({ mobileOpen, onMobileMenuToggle }) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    const confirmed = await showConfirm("Are you sure you want to log out?", "", "Yes", "Cancel", "question", true);
    if (!confirmed) return;
    try { await apiRequest("/auth/logout", { method: "POST" }); } catch {}
    clearAuthStorage();
    navigate("/");
  };

  const handleNavClick = () => {
    if (window.innerWidth <= 768 && onMobileMenuToggle) {
      onMobileMenuToggle();
    }
  };

  return (
    <aside className={`app-sidebar admin-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span>Admin Portal</span>
        </div>
        <button className="mobile-close-btn" onClick={onMobileMenuToggle} type="button" aria-label="Close menu">
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>

      <nav className="sidebar-nav">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="nav-section">
            <span className="nav-section-label">{section.label}</span>
            <ul className="nav-list">
              {section.items.map(({ to, label, icon, end }) => (
                <li key={to} className="nav-item">
                  <NavLink to={to} end={end} onClick={handleNavClick}>
                    <FontAwesomeIcon icon={icon} className="nav-icon" />
                    <span>{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="logout-btn" onClick={handleLogout}>
          <FontAwesomeIcon icon={faSignOutAlt} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
