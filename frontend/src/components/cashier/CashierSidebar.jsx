import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGaugeHigh,
  faCashRegister,
  faListAlt,
  faClockRotateLeft,
  faChartBar,
  faUser,
  faArrowRightFromBracket,
} from "@fortawesome/free-solid-svg-icons";
import { showConfirm } from "../../utils/alert.jsx";
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
            <NavLink to="/cashier" end onClick={handleNavClick} className={({ isActive }) => isActive ? "active" : ""}>
              <FontAwesomeIcon icon={faGaugeHigh} className="nav-icon" />
              <span>Dashboard</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/cashier/pos" onClick={handleNavClick} className={({ isActive }) => isActive ? "active" : ""}>
              <FontAwesomeIcon icon={faCashRegister} className="nav-icon" />
              <span>POS</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/cashier/transactions" onClick={handleNavClick} className={({ isActive }) => isActive ? "active" : ""}>
              <FontAwesomeIcon icon={faListAlt} className="nav-icon" />
              <span>Transactions</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/cashier/history" onClick={handleNavClick} className={({ isActive }) => isActive ? "active" : ""}>
              <FontAwesomeIcon icon={faClockRotateLeft} className="nav-icon" />
              <span>History</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/cashier/reports" onClick={handleNavClick} className={({ isActive }) => isActive ? "active" : ""}>
              <FontAwesomeIcon icon={faChartBar} className="nav-icon" />
              <span>Reports</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/cashier/profile" onClick={handleNavClick} className={({ isActive }) => isActive ? "active" : ""}>
              <FontAwesomeIcon icon={faUser} className="nav-icon" />
              <span>Profile</span>
            </NavLink>
          </li>
        </ul>
      </nav>

      <div className="sidebar-footer">
        <button className="logout-btn" onClick={handleLogout}>
          <FontAwesomeIcon icon={faArrowRightFromBracket} />
          Logout
        </button>
      </div>
    </aside>
  );
};

export default CashierSidebar;
