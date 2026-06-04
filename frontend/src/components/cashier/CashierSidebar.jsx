import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { showConfirm } from "../../utils/alert";
import { apiRequest, clearAuthStorage } from "../../api/client";
import "./CashierSidebar.css";

const CashierSidebar = ({ mobileOpen, onMobileMenuToggle }) => {
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
    <aside className={`app-sidebar cashier-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span>Cashier Portal</span>
        </div>
        <button className="mobile-close-btn" onClick={onMobileMenuToggle} type="button" aria-label="Close menu">
          &times;
        </button>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          <li className="nav-item">
            <NavLink to="/cashier" end onClick={handleNavClick}>
              Dashboard
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/cashier/pos" onClick={handleNavClick}>
              POS
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/cashier/transactions" onClick={handleNavClick}>
              Transactions
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/cashier/history" onClick={handleNavClick}>
              History
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/cashier/reports" onClick={handleNavClick}>
              Reports
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/cashier/profile" onClick={handleNavClick}>
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

export default CashierSidebar;
