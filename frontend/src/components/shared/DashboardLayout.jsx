import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars } from "@fortawesome/free-solid-svg-icons";
import DashboardProfile from "./DashboardProfile";
import NotificationDropdown from "./NotificationDropdown";
import RoleAwareChatbot from "../chatbot/RoleAwareChatbot";

const DashboardLayout = ({
  sidebar,
  title,
  subtitle,
  role,
  profilePhoto = "",
  name = "",
  extraActions,
  children,
  showChatbot = false,
  chatbotTitle = "Assistant",
  chatbotSubtitle = "How can I help?",
  className = "",
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const toggleMenu = () => setMobileMenuOpen((prev) => !prev);
  const closeMenu = () => setMobileMenuOpen(false);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeMenu();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.classList.add("sidebar-open");

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("sidebar-open");
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const sidebarWithProps = sidebar
    ? React.cloneElement(sidebar, {
        mobileOpen: mobileMenuOpen,
        onMobileMenuToggle: toggleMenu,
      })
    : null;

  return (
    <div className={`app-dashboard ${className} ${mobileMenuOpen ? "mobile-open" : ""}`}>
      {sidebarWithProps}

      <div
        className={`mobile-backdrop ${mobileMenuOpen ? "active" : ""}`}
        onClick={closeMenu}
        aria-hidden={!mobileMenuOpen}
      />

      <main className="app-main">
        <header className="app-topbar">
          <button
            className="mobile-menu-toggle"
            onClick={toggleMenu}
            aria-label="Toggle mobile menu"
            aria-expanded={mobileMenuOpen}
            type="button"
          >
            <FontAwesomeIcon icon={faBars} />
          </button>

          <div className="navbar-left">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>

          <div className="navbar-actions">
            {extraActions}

            <DashboardProfile
              name={name}
              role={role}
              image={profilePhoto}
            />

            <NotificationDropdown role={role} />
          </div>
        </header>

        <section className="app-content dashboard-content">
          {children}
        </section>
      </main>

      {showChatbot && (
        <RoleAwareChatbot
          mode="widget"
          title={chatbotTitle}
          subtitle={chatbotSubtitle}
        />
      )}
    </div>
  );
};

export default DashboardLayout;
