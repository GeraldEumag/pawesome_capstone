import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { showConfirm } from "../../utils/alert.jsx";
import { apiRequest, clearAuthStorage } from "../../api/client";
import "./ReceptionistSidebar.css";

const ReceptionistSidebar = ({ mobileOpen, onMobileMenuToggle }) => {
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
    <aside className={`app-sidebar receptionist-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span>Reception Portal</span>
        </div>
        <button className="mobile-close-btn" onClick={onMobileMenuToggle} type="button" aria-label="Close menu">
          &times;
        </button>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          <li className="nav-item">
            <NavLink to="/receptionist/appointments-boarding" end onClick={handleNavClick}>
              Appointments & Boarding
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/receptionist/customer-profile" onClick={handleNavClick}>
              Customer Profile
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/receptionist/chatbot" onClick={handleNavClick}>
              Chatbot
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/receptionist/profile" onClick={handleNavClick}>
              Profile
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/receptionist/history" onClick={handleNavClick}>
              History
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/receptionist/reports" onClick={handleNavClick}>
              Reports
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

export default ReceptionistSidebar;