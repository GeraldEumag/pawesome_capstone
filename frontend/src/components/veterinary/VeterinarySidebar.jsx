import React from "react";
import { NavLink } from "react-router-dom";
import { showConfirm } from "../../utils/alert";
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

  return (
    <aside className={`app-sidebar veterinary-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span>Vet Portal</span>
        </div>
        <button className="mobile-close-btn" onClick={onMobileMenuToggle} type="button" aria-label="Close menu">
          &times;
        </button>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          <li className="nav-item">
            <NavLink to="/veterinary" end onClick={handleNavClick}>
              Dashboard
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/veterinary/appointments" onClick={handleNavClick}>
              Appointments
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/veterinary/customer-profiles" onClick={handleNavClick}>
              Customer Profiles
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/veterinary/current-boarders" onClick={handleNavClick}>
              Current Boarders
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/veterinary/services" onClick={handleNavClick}>
              Services
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/veterinary/history" onClick={handleNavClick}>
              History
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/veterinary/reports" onClick={handleNavClick}>
              Reports
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/veterinary/profile" onClick={handleNavClick}>
              Profile
            </NavLink>
          </li>
        </ul>
      </nav>

      <div className="sidebar-footer">
        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </aside>
  );
};

export default VeterinarySidebar;