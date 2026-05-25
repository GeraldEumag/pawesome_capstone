import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { showConfirm } from "../../utils/alert";
import { apiRequest, clearAuthStorage } from "../../api/client";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHome,
  faChartLine,
  faUsers,
  faClipboardList,
  faMoneyBillWave,
  faFileAlt,
  faUserCircle,
  faSignOutAlt,
  faHistory,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
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

  return (
    <aside className={`app-sidebar manager-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <FontAwesomeIcon icon={faChartLine} />
          <span>Manager Portal</span>
        </div>
        <button className="mobile-close-btn" onClick={onMobileMenuToggle} type="button" aria-label="Close menu">
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          <li className="nav-item">
            <NavLink to="/manager" end>
              <FontAwesomeIcon icon={faHome} />
              <span>Dashboard</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/manager/staff">
              <FontAwesomeIcon icon={faUsers} />
              <span>Staff</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/manager/attendance">
              <FontAwesomeIcon icon={faClipboardList} />
              <span>Attendance</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/manager/payroll">
              <FontAwesomeIcon icon={faMoneyBillWave} />
              <span>Payroll</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/manager/history">
              <FontAwesomeIcon icon={faHistory} />
              <span>History</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/manager/reports">
              <FontAwesomeIcon icon={faFileAlt} />
              <span>Reports</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/manager/profile">
              <FontAwesomeIcon icon={faUserCircle} />
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

export default ManagerSidebar;
