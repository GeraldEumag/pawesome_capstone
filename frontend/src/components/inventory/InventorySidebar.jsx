import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { showConfirm } from "../../utils/alert";
import { apiRequest, clearAuthStorage } from "../../api/client";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHome,
  faBoxes,
  faWarehouse,
  faHistory,
  faChartBar,
  faSignOutAlt,
  faListCheck,
  faUser,
  faCog,
  faClipboardCheck,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
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

  return (
    <aside className={`app-sidebar inventory-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <FontAwesomeIcon icon={faWarehouse} />
          <span>Inventory Portal</span>
        </div>
        <button className="mobile-close-btn" onClick={onMobileMenuToggle} type="button" aria-label="Close menu">
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          <li className="nav-item">
            <NavLink to="/inventory" className={({ isActive }) => isActive ? "active" : ""} end>
              <FontAwesomeIcon icon={faHome} />
              <span>Dashboard</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/inventory/products" className={({ isActive }) => isActive ? "active" : ""} end>
              <FontAwesomeIcon icon={faBoxes} />
              <span>Inventory Items</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/inventory/stock" className={({ isActive }) => isActive ? "active" : ""} end>
              <FontAwesomeIcon icon={faListCheck} />
              <span>Stock Management</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/inventory/management" className={({ isActive }) => isActive ? "active" : ""} end>
              <FontAwesomeIcon icon={faCog} />
              <span>Management</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/inventory/history" className={({ isActive }) => isActive ? "active" : ""} end>
              <FontAwesomeIcon icon={faHistory} />
              <span>History</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/inventory/reports" className={({ isActive }) => isActive ? "active" : ""} end>
              <FontAwesomeIcon icon={faChartBar} />
              <span>Reports</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/inventory/monthly-audit" className={({ isActive }) => isActive ? "active" : ""} end>
              <FontAwesomeIcon icon={faClipboardCheck} />
              <span>Monthly Audit</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/inventory/monthly-audit-report" className={({ isActive }) => isActive ? "active" : ""} end>
              <FontAwesomeIcon icon={faClipboardCheck} />
              <span>Audit Reports</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/inventory/audit-analytics" className={({ isActive }) => isActive ? "active" : ""} end>
              <FontAwesomeIcon icon={faChartBar} />
              <span>Audit Analytics</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/inventory/profile" className={({ isActive }) => isActive ? "active" : ""} end>
              <FontAwesomeIcon icon={faUser} />
              <span>Profile</span>
            </NavLink>
          </li>
        </ul>
      </nav>

      <div className="sidebar-footer">
        <button className="logout-btn" onClick={handleLogout}>
          <FontAwesomeIcon icon={faSignOutAlt} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default InventorySidebar;
