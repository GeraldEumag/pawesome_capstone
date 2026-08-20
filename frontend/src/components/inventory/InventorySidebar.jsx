import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faWarehouse,
  faBoxes,
  faHistory,
  faChartBar,
  faClipboardList,
  faFileAlt,
  faChartPie,
  faUserCircle,
  faSignOutAlt,
  faTimes,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import { showConfirm } from "../../utils/alert.jsx";
import { apiRequest, clearAuthStorage } from "../../api/client";
import "./InventorySidebar.css";

const NAV_SECTIONS = [
  {
    label: "Manage",
    items: [
      { to: "/inventory", label: "Dashboard", icon: faWarehouse, end: true },
      { to: "/inventory/stock", label: "Stock Management", icon: faBoxes },
      { to: "/inventory/history", label: "History", icon: faHistory },
    ],
  },
  {
    label: "Reports & Audit",
    items: [
      { to: "/inventory/reports", label: "Reports", icon: faChartBar },
      { to: "/inventory/monthly-audit", label: "Monthly Audit", icon: faClipboardList },
      { to: "/inventory/monthly-audit-report", label: "Audit Reports", icon: faFileAlt },
      { to: "/inventory/audit-analytics", label: "Audit Analytics", icon: faChartPie },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/inventory/payroll", label: "My Payroll", icon: faWallet },
      { to: "/inventory/profile", label: "Profile", icon: faUserCircle },
    ],
  },
];

const InventorySidebar = ({ mobileOpen, onMobileMenuToggle }) => {
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
    <aside className={`app-sidebar inventory-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span>Inventory Portal</span>
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

export default InventorySidebar;
