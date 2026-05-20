import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { showConfirm } from "../../utils/alert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHome,
  faPaw,
  faSignOutAlt,
  faUser,
  faBone,
  faCalendarAlt,
  faCreditCard,
  faCalendarPlus,
} from "@fortawesome/free-solid-svg-icons";
import "./CustomerSidebar.css";

const CustomerSidebar = ({ collapsed, onToggleCollapse }) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    const confirmed = await showConfirm("Are you sure you want to log out?", "", "Yes", "Cancel", "question", true);
    if (!confirmed) return;
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("name");
    localStorage.removeItem("email");
    navigate("/");
  };

  const navItems = [
    {
      to: "/customer",
      label: "Dashboard",
      icon: faHome,
    },
    {
      to: "/customer/pets",
      label: "My Pets",
      icon: faPaw,
    },
    {
      to: "/customer/bookings",
      label: "Book Services",
      icon: faCalendarPlus,
    },
    {
      to: "/customer/requests",
      label: "My Requests",
      icon: faCalendarAlt,
    },
    {
      to: "/customer/payments",
      label: "Payment History",
      icon: faCreditCard,
    },
    {
      to: "/customer/profile",
      label: "Profile",
      icon: faUser,
    },
  ];

  return (
    <aside className={`app-sidebar customer-sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <FontAwesomeIcon icon={faBone} />
          <span>Customer Portal</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          {navItems.map((item) => (
            <li className="nav-item" key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === "/customer"}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? "active" : ""}`
                }
              >
                <FontAwesomeIcon icon={item.icon} />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
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

export default CustomerSidebar;
