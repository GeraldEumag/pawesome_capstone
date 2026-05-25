import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { showConfirm } from "../../utils/alert";
import { apiRequest, clearAuthStorage } from "../../api/client";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHome,
  faCashRegister,
  faHistory,
  faChartBar,
  faSignOutAlt,
  faUser,
  faReceipt,
  faCheckCircle,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
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

  return (
    <aside className={`app-sidebar cashier-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <FontAwesomeIcon icon={faCashRegister} />
          <span>Cashier Portal</span>
        </div>
        <button className="mobile-close-btn" onClick={onMobileMenuToggle} type="button" aria-label="Close menu">
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          <li className="nav-item">
            <NavLink
              to="/cashier"
              className={({ isActive }) => (isActive ? "active" : "")}
              end
              title="Dashboard"
            >
              <FontAwesomeIcon icon={faHome} />
              <span>Dashboard</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/cashier/pos"
              className={({ isActive }) => (isActive ? "active" : "")}
              title="POS"
            >
              <FontAwesomeIcon icon={faCashRegister} />
              <span>POS</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/cashier/transactions"
              className={({ isActive }) => (isActive ? "active" : "")}
              title="Transactions"
            >
              <FontAwesomeIcon icon={faReceipt} />
              <span>Transactions</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/cashier/payment-verification"
              className={({ isActive }) => (isActive ? "active" : "")}
              title="Payment Verification"
            >
              <FontAwesomeIcon icon={faCheckCircle} />
              <span>Payment Verification</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/cashier/history"
              className={({ isActive }) => (isActive ? "active" : "")}
              title="History"
            >
              <FontAwesomeIcon icon={faHistory} />
              <span>History</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/cashier/reports"
              className={({ isActive }) => (isActive ? "active" : "")}
              title="Reports"
            >
              <FontAwesomeIcon icon={faChartBar} />
              <span>Reports</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/cashier/profile"
              className={({ isActive }) => (isActive ? "active" : "")}
              title="Profile"
            >
              <FontAwesomeIcon icon={faUser} />
              <span>Profile</span>
            </NavLink>
          </li>
        </ul>
      </nav>

      <div className="sidebar-footer">
        <button className="logout-btn" onClick={handleLogout} title="Logout">
          <FontAwesomeIcon icon={faSignOutAlt} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default CashierSidebar;
