import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { showConfirm } from "../../utils/alert";
import { apiRequest, clearAuthStorage } from "../../api/client";
import "./InventorySidebar.css";

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
          &times;
        </button>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          <li className="nav-item">
            <NavLink to="/inventory" end onClick={handleNavClick}>
              Unified Inventory
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/inventory/stock" onClick={handleNavClick}>
              Stock Management
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/inventory/history" onClick={handleNavClick}>
              History
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/inventory/reports" onClick={handleNavClick}>
              Reports
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/inventory/monthly-audit" onClick={handleNavClick}>
              Monthly Audit
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/inventory/monthly-audit-report" onClick={handleNavClick}>
              Audit Reports
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/inventory/audit-analytics" onClick={handleNavClick}>
              Audit Analytics
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/inventory/profile" onClick={handleNavClick}>
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

export default InventorySidebar;
