import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { showConfirm } from "../../utils/alert.jsx";
import { apiRequest, clearAuthStorage } from "../../api/client";
import "./AdminSidebar.css";

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
          &times;
        </button>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          <li className="nav-item">
            <NavLink to="/admin" end onClick={handleNavClick}>
              Dashboard
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/admin/users" onClick={handleNavClick}>
              Users
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/admin/profile" onClick={handleNavClick}>
              Profile
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/admin/chatbot" onClick={handleNavClick}>
              Chatbot
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/admin/history" onClick={handleNavClick}>
              History
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/admin/reports" onClick={handleNavClick}>
              Reports
            </NavLink>
          </li>
        </ul>
      </nav>

      <div className="sidebar-footer">
        <NavLink to="/admin/settings" className="settings-link" onClick={handleNavClick}>
          Settings
        </NavLink>
        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
