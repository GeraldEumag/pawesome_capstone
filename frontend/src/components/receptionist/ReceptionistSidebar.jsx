import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { showConfirm } from "../../utils/alert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarAlt,
  faPhone,
  faSignOutAlt,
  faUser,
  faChartBar,
  faHotel,
  faCut,
  faRobot,
  faCheckCircle,
  faCalendarCheck,
  faHistory,
} from "@fortawesome/free-solid-svg-icons";
import "./ReceptionistSidebar.css";

const ReceptionistSidebar = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    const confirmed = await showConfirm("Are you sure you want to log out?", "", "Yes", "Cancel", "question", true);
    if (!confirmed) return;
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("name");
    navigate("/");
  };

  return (
    <aside className="app-sidebar receptionist-sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <FontAwesomeIcon icon={faPhone} />
          <span>Reception Portal</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          <li className="nav-item">
            <NavLink
              to="/receptionist/dashboard"
              end
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <FontAwesomeIcon icon={faCalendarCheck} />
              <span>Dashboard</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink
              to="/receptionist/bookings"
              end
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <FontAwesomeIcon icon={faCalendarAlt} />
              <span>Bookings</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink
              to="/receptionist/bookings/hotel"
              end
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <FontAwesomeIcon icon={faHotel} />
              <span>Pet Hotel</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink
              to="/receptionist/bookings/grooming"
              end
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <FontAwesomeIcon icon={faCut} />
              <span>Grooming</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink
              to="/receptionist/customer-profile"
              end
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <FontAwesomeIcon icon={faUser} />
              <span>Customer Profile</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink
              to="/receptionist/approvals"
              end
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <FontAwesomeIcon icon={faCheckCircle} />
              <span>Approvals</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink
              to="/receptionist/chatbot"
              end
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <FontAwesomeIcon icon={faRobot} />
              <span>Chatbot</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink
              to="/receptionist/profile"
              end
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <FontAwesomeIcon icon={faUser} />
              <span>Profile</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink
              to="/receptionist/history"
              end
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <FontAwesomeIcon icon={faHistory} />
              <span>History</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink
              to="/receptionist/reports"
              end
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <FontAwesomeIcon icon={faChartBar} />
              <span>Reports</span>
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

export default ReceptionistSidebar;