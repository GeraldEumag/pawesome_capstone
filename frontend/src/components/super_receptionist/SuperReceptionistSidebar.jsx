import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHotel,
  faStethoscope,
  faScissors,
  faWalking,
  faUsers,
  faClipboardList,
  faHistory,
  faCashRegister,
  faListAlt,
  faChartBar,
  faBoxes,
  faWarehouse,
  faClipboardCheck,
  faWallet,
  faUserCircle,
  faSignOutAlt,
  faTimes,
  faChevronDown,
  faLayerGroup,
  faArrowLeft,
} from "@fortawesome/free-solid-svg-icons";
import { showConfirm } from "../../utils/alert.jsx";
import { apiRequest, clearAuthStorage } from "../../api/client";
import "./SuperReceptionistSidebar.css";

const NAV_SECTIONS = [
  {
    label: "Front Desk",
    icon: faHotel,
    items: [
      { to: "/super-receptionist/bookings/hotel", label: "Hotel Bookings", icon: faHotel },
      { to: "/super-receptionist/bookings/vet", label: "Vet Bookings", icon: faStethoscope },
      { to: "/super-receptionist/bookings/grooming", label: "Grooming", icon: faScissors },
      { to: "/super-receptionist/walk-ins", label: "Walk-ins", icon: faWalking },
      { to: "/super-receptionist/customers", label: "Customers", icon: faUsers },
      { to: "/super-receptionist/manage-services", label: "Manage Services", icon: faClipboardList },
      { to: "/super-receptionist/history", label: "History", icon: faHistory },
    ],
  },
  {
    label: "Cashier",
    icon: faCashRegister,
    items: [
      { to: "/cashier/pos", label: "POS (Full Screen)", icon: faCashRegister, external: true },
      { to: "/super-receptionist/cashier-payments", label: "Transactions", icon: faListAlt },
      { to: "/super-receptionist/cashier-history", label: "History", icon: faHistory },
      { to: "/super-receptionist/cashier-reports", label: "Reports", icon: faChartBar },
    ],
  },
  {
    label: "Inventory",
    icon: faWarehouse,
    items: [
      { to: "/super-receptionist/inventory", label: "Stock Management", icon: faBoxes },
      { to: "/super-receptionist/inventory/history", label: "History", icon: faHistory },
      { to: "/super-receptionist/inventory/reports", label: "Reports", icon: faChartBar },
      { to: "/super-receptionist/inventory/audit", label: "Monthly Audit", icon: faClipboardCheck },
    ],
  },
  {
    label: "Account",
    icon: faUserCircle,
    items: [
      { to: "/super-receptionist/payroll", label: "My Payroll", icon: faWallet },
      { to: "/super-receptionist/profile", label: "Profile", icon: faUserCircle },
    ],
  },
];

const SuperReceptionistSidebar = ({ mobileOpen, onMobileMenuToggle }) => {
  const navigate = useNavigate();
  const [openSections, setOpenSections] = useState(() => {
    // All sections open by default
    const initial = {};
    NAV_SECTIONS.forEach((s) => { initial[s.label] = true; });
    return initial;
  });

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

  const toggleSection = (label) => {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <aside className={`app-sidebar super-receptionist-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span>Super Receptionist</span>
        </div>
        <button className="mobile-close-btn" onClick={onMobileMenuToggle} type="button" aria-label="Close menu">
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>

      <button
        className="super-back-btn"
        type="button"
        onClick={() => { navigate("/super-receptionist/bookings/hotel"); handleNavClick(); }}
        title="Back to Home"
      >
        <FontAwesomeIcon icon={faArrowLeft} />
        <span>Back to Home</span>
      </button>

      <nav className="sidebar-nav">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="nav-section">
            <button
              type="button"
              className="nav-section-toggle"
              onClick={() => toggleSection(section.label)}
              aria-expanded={openSections[section.label]}
            >
              <FontAwesomeIcon icon={section.icon} className="nav-section-icon" />
              <span className="nav-section-label">{section.label}</span>
              <FontAwesomeIcon
                icon={faChevronDown}
                className={`nav-section-chevron ${openSections[section.label] ? "open" : ""}`}
              />
            </button>
            {openSections[section.label] && (
              <ul className="nav-list">
                {section.items.map(({ to, label, icon, external }) => (
                  <li key={to} className="nav-item">
                    <NavLink
                      to={to}
                      onClick={handleNavClick}
                      end={to === "/super-receptionist/inventory"}
                    >
                      <FontAwesomeIcon icon={icon} className="nav-icon" />
                      <span>{label}</span>
                      {external && <FontAwesomeIcon icon={faLayerGroup} className="external-icon" />}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
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

export default SuperReceptionistSidebar;
