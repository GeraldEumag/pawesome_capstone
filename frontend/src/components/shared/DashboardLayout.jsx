import React, { useState } from "react";
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
  onProfileUpload,
  extraActions,
  children,
  showChatbot = false,
  chatbotTitle = "Assistant",
  chatbotSubtitle = "How can I help?",
  className = "",
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMenu = () => setMobileMenuOpen((prev) => !prev);
  const closeMenu = () => setMobileMenuOpen(false);

  const sidebarWithProps = sidebar
    ? React.cloneElement(sidebar, {
        mobileOpen: mobileMenuOpen,
        onMobileMenuToggle: toggleMenu,
      })
    : null;

  return (
    <div className={`app-dashboard ${className} ${mobileMenuOpen ? "mobile-open" : ""}`}>
      {sidebarWithProps}

      <div className="mobile-backdrop" onClick={closeMenu} />

      <main className="app-main">
        <header className="app-topbar">
          <button
            className="mobile-menu-toggle"
            onClick={toggleMenu}
            aria-label="Toggle mobile menu"
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

            {onProfileUpload && (
              <DashboardProfile
                name={name}
                role={role}
                image={profilePhoto}
                onUpload={onProfileUpload}
              />
            )}

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
