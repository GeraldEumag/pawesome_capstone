import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { showConfirm } from "../../utils/alert";
import { apiRequest, clearAuthStorage } from "../../api/client";
import "./ManagerSidebar.css";

const ManagerSidebar = ({ mobileOpen, onMobileMenuToggle }) => {
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
    <aside className={`app-sidebar manager-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span>Manager Portal</span>
        </div>
        <button className="mobile-close-btn" onClick={onMobileMenuToggle} type="button" aria-label="Close menu">
          &times;
        </button>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          <li className="nav-item">
            <NavLink to="/manager" end onClick={handleNavClick}>
              Dashboard
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/manager/staff" onClick={handleNavClick}>
              Staff
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/manager/attendance" onClick={handleNavClick}>
              Attendance
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/manager/kiosk" onClick={handleNavClick}>
              Fingerprint Kiosk
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/manager/leaves" onClick={handleNavClick}>
              Leave
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/manager/schedule" onClick={handleNavClick}>
              Schedule
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/manager/payroll" onClick={handleNavClick}>
              Payroll
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/manager/history" onClick={handleNavClick}>
              History
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/manager/reports" onClick={handleNavClick}>
              Reports
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/manager/profile" onClick={handleNavClick}>
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

export default ManagerSidebar;
