import React from "react";
import { NavLink } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGauge,
  faCalendarAlt,
  faUsers,
  faHotel,
  faStethoscope,
  faClockRotateLeft,
  faChartBar,
  faUser,
  faRightFromBracket,
  faPaw,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import { showConfirm } from "../../utils/alert.jsx";
import { apiRequest, clearAuthStorage } from "../../api/client";
import "./VeterinarySidebar.css";

const VeterinarySidebar = ({ mobileOpen, onMobileMenuToggle }) => {
  const handleLogout = async () => {
    const confirmed = await showConfirm("Are you sure you want to log out?", "", "Yes", "Cancel", "question", true);
    if (!confirmed) return;
    try { await apiRequest("/auth/logout", { method: "POST" }); } catch {}
    clearAuthStorage();
    window.location.href = "/login";
  };

  const handleNavClick = () => {
    if (window.innerWidth <= 768 && onMobileMenuToggle) {
      onMobileMenuToggle();
    }
  };

  const navItems = [
    { to: "/veterinary", label: "Dashboard", icon: faGauge, end: true },
    { to: "/veterinary/appointments", label: "Appointments", icon: faCalendarAlt },
    { to: "/veterinary/customer-profiles", label: "Customer Profiles", icon: faUsers },
    { to: "/veterinary/current-boarders", label: "Current Boarders", icon: faHotel },
    { to: "/veterinary/services", label: "Services", icon: faStethoscope },
    { to: "/veterinary/history", label: "History", icon: faClockRotateLeft },
    { to: "/veterinary/reports", label: "Reports", icon: faChartBar },
    { to: "/veterinary/payroll", label: "My Payroll", icon: faWallet },
    { to: "/veterinary/profile", label: "Profile", icon: faUser },
  ];

  return (
    <aside className={`app-sidebar veterinary-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <FontAwesomeIcon icon={faPaw} />
          </div>
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-title">Vet Portal</span>
            <span className="sidebar-logo-sub">Pawesome Clinic</span>
          </div>
        </div>
        <button className="mobile-close-btn" onClick={onMobileMenuToggle} type="button" aria-label="Close menu">
          &times;
        </button>
      </div>

      <nav className="sidebar-nav">
        <p className="sidebar-nav-label">Main Navigation</p>
        <ul className="nav-list">
          {navItems.map(({ to, label, icon, end }) => (
            <li key={to} className="nav-item">
              <NavLink to={to} end={end} onClick={handleNavClick}>
                <span className="nav-icon">
                  <FontAwesomeIcon icon={icon} />
                </span>
                <span className="nav-label">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <button className="logout-btn" onClick={handleLogout} type="button">
          <FontAwesomeIcon icon={faRightFromBracket} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default VeterinarySidebar;