import React, { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { showConfirm } from "../../utils/alert.jsx";
import { apiRequest, clearAuthStorage } from "../../api/client";
import {
  FaHotel,
  FaStethoscope,
  FaCut,
  FaWrench,
  FaUserPlus,
  FaChevronDown,
  FaChevronUp,
  FaUser,
  FaRobot,
  FaHistory,
  FaChartBar,
  FaCog,
  FaWallet,
} from "react-icons/fa";
import "./ReceptionistSidebar.css";

const ReceptionistSidebar = ({ mobileOpen, onMobileMenuToggle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [bookingDropdownOpen, setBookingDropdownOpen] = useState(
    location.pathname.startsWith("/receptionist/bookings")
  );

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

  const toggleBookingDropdown = () => {
    setBookingDropdownOpen(!bookingDropdownOpen);
  };

  const isBookingActive = location.pathname.startsWith("/receptionist/bookings");

  return (
    <aside className={`app-sidebar receptionist-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span>Reception Portal</span>
        </div>
        <button className="mobile-close-btn" onClick={onMobileMenuToggle} type="button" aria-label="Close menu">
          &times;
        </button>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          {/* Booking Dropdown */}
          <li className="nav-item dropdown">
            <button
              type="button"
              className={`dropdown-toggle ${isBookingActive ? "has-active-child" : ""}`}
              onClick={toggleBookingDropdown}
              aria-expanded={bookingDropdownOpen}
            >
              <FaHotel className="nav-icon" />
              <span>Booking</span>
              {bookingDropdownOpen ? <FaChevronUp className="dropdown-icon" /> : <FaChevronDown className="dropdown-icon" />}
            </button>
            {bookingDropdownOpen && (
              <ul className="dropdown-menu">
                <li className="nav-item">
                  <NavLink to="/receptionist/bookings/hotel" onClick={handleNavClick}>
                    <FaHotel className="nav-icon" /> Hotel
                  </NavLink>
                </li>
                <li className="nav-item">
                  <NavLink to="/receptionist/bookings/veterinary" onClick={handleNavClick}>
                    <FaStethoscope className="nav-icon" /> Veterinary
                  </NavLink>
                </li>
                <li className="nav-item">
                  <NavLink to="/receptionist/bookings/grooming" onClick={handleNavClick}>
                    <FaCut className="nav-icon" /> Grooming
                  </NavLink>
                </li>
              </ul>
            )}
          </li>

          {/* Manage Services */}
          <li className="nav-item">
            <NavLink to="/receptionist/manage-services" onClick={handleNavClick}>
              <FaWrench className="nav-icon" /> Manage Services
            </NavLink>
          </li>

          {/* Walk-ins */}
          <li className="nav-item">
            <NavLink to="/receptionist/walk-ins" onClick={handleNavClick}>
              <FaUserPlus className="nav-icon" /> Walk-ins
            </NavLink>
          </li>

          {/* Customer Profile */}
          <li className="nav-item">
            <NavLink to="/receptionist/customer-profile" onClick={handleNavClick}>
              <FaUser className="nav-icon" /> Customer Profile
            </NavLink>
          </li>

          {/* Chatbot */}
          <li className="nav-item">
            <NavLink to="/receptionist/chatbot" onClick={handleNavClick}>
              <FaRobot className="nav-icon" /> Chatbot
            </NavLink>
          </li>

          {/* History */}
          <li className="nav-item">
            <NavLink to="/receptionist/history" onClick={handleNavClick}>
              <FaHistory className="nav-icon" /> History
            </NavLink>
          </li>

          {/* Reports */}
          <li className="nav-item">
            <NavLink to="/receptionist/reports" onClick={handleNavClick}>
              <FaChartBar className="nav-icon" /> Reports
            </NavLink>
          </li>

          {/* My Payroll */}
          <li className="nav-item">
            <NavLink to="/receptionist/payroll" onClick={handleNavClick}>
              <FaWallet className="nav-icon" /> My Payroll
            </NavLink>
          </li>

          {/* Profile */}
          <li className="nav-item">
            <NavLink to="/receptionist/profile" onClick={handleNavClick}>
              <FaCog className="nav-icon" /> Profile
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

export default ReceptionistSidebar;