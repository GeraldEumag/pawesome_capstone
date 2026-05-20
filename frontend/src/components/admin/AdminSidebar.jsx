import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { showConfirm } from "../../utils/alert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHome,
  faUsers,
  faHistory,
  faChartBar,
  faSignOutAlt,
  faTimes,
  faUser,
  faBuilding,
  faMoneyBillWave,
  faDollarSign,
  faFileInvoiceDollar,
  faRobot,
  faCog,
} from "@fortawesome/free-solid-svg-icons";
import "./AdminSidebar.css";

const AdminSidebar = ({ mobileOpen, onMobileMenuToggle }) => {
  const [payrollExpanded, setPayrollExpanded] = React.useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    const confirmed = await showConfirm("Are you sure you want to log out?", "", "Yes", "Cancel", "question", true);
    if (!confirmed) return;
    localStorage.clear();
    navigate("/");
  };

  return (
    <aside className={`app-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-brand-icon">
          <FontAwesomeIcon icon={faBuilding} />
        </div>

        <div className="sidebar-logo">
          <span>Admin Portal</span>
        </div>

        <button className="mobile-close-btn" onClick={onMobileMenuToggle}>
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          <li className="nav-item">
            <NavLink to="/admin" end>
              <FontAwesomeIcon icon={faHome} />
              <span>Dashboard</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/admin/users">
              <FontAwesomeIcon icon={faUsers} />
              <span>Users</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/admin/profile">
              <FontAwesomeIcon icon={faUser} />
              <span>Profile</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/admin/chatbot">
              <FontAwesomeIcon icon={faRobot} />
              <span>Chatbot</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <div
              className="nav-dropdown-header"
              onClick={() => setPayrollExpanded(!payrollExpanded)}
            >
              <FontAwesomeIcon icon={faMoneyBillWave} />
              <span>Payroll</span>
            </div>

            <ul className={`nav-sublist ${payrollExpanded ? "expanded" : ""}`}>
              <li className="nav-subitem">
                <NavLink to="/admin/payroll" end>
                  <FontAwesomeIcon icon={faMoneyBillWave} />
                  <span>Overview</span>
                </NavLink>
              </li>

              <li className="nav-subitem">
                <NavLink to="/admin/payroll/salaries">
                  <FontAwesomeIcon icon={faDollarSign} />
                  <span>Salaries</span>
                </NavLink>
              </li>

              <li className="nav-subitem">
                <NavLink to="/admin/payroll/reports">
                  <FontAwesomeIcon icon={faFileInvoiceDollar} />
                  <span>Reports</span>
                </NavLink>
              </li>
            </ul>
          </li>

          <li className="nav-item">
            <NavLink to="/admin/history">
              <FontAwesomeIcon icon={faHistory} />
              <span>History</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/admin/reports">
              <FontAwesomeIcon icon={faChartBar} />
              <span>Reports</span>
            </NavLink>
          </li>
        </ul>
      </nav>

      <div className="sidebar-footer">
        <NavLink to="/admin/settings" className="settings-link">
          <FontAwesomeIcon icon={faCog} />
          <span>Settings</span>
        </NavLink>

        <button className="logout-btn" onClick={handleLogout}>
          <FontAwesomeIcon icon={faSignOutAlt} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
