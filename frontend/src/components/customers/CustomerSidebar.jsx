import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  FaTachometerAlt,
  FaPaw,
  FaConciergeBell,
  FaCalendarCheck,
  FaBox,
  FaCreditCard,
  FaBell,
  FaHistory,
  FaHeartbeat,
  FaChartBar,
  FaUser,
  FaSignOutAlt,
} from "react-icons/fa";
import { showConfirm } from "../../utils/alert.jsx";
import { apiRequest, clearAuthStorage } from "../../api/client";
import "./CustomerSidebar.css";

const CustomerSidebar = ({ mobileOpen, onMobileMenuToggle }) => {
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

  const navItems = [
    { to: "/customer",                      label: "Dashboard",           icon: <FaTachometerAlt />, end: true },
    { to: "/customer/pets",                 label: "My Pets",             icon: <FaPaw /> },
    { to: "/customer/services",             label: "Services",            icon: <FaConciergeBell /> },
    { to: "/customer/bookings",             label: "Bookings",            icon: <FaCalendarCheck /> },
    { to: "/customer/orders",               label: "My Orders",           icon: <FaBox /> },
    { to: "/customer/payments",             label: "Payments",            icon: <FaCreditCard /> },
    { to: "/customer/notifications",        label: "Notifications",       icon: <FaBell /> },
    { to: "/customer/history",              label: "History",             icon: <FaHistory /> },
    { to: "/customer/medical-confinements", label: "Medical",             icon: <FaHeartbeat /> },
    { to: "/customer/reports",              label: "Reports",             icon: <FaChartBar /> },
    { to: "/customer/profile",              label: "Profile",             icon: <FaUser /> },
  ];

  return (
    <aside className={`app-sidebar customer-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <FaPaw />
          </div>
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-name">Pawesome</span>
            <span className="sidebar-logo-role">Customer Portal</span>
          </div>
        </div>
        <button className="mobile-close-btn" onClick={onMobileMenuToggle} type="button" aria-label="Close menu">
          &times;
        </button>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          {navItems.map((item) => (
            <li className="nav-item" key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={handleNavClick}
                className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <button className="logout-btn" onClick={handleLogout} type="button">
          <FaSignOutAlt />
          <span>Log Out</span>
        </button>
      </div>
    </aside>
  );
};

export default CustomerSidebar;
