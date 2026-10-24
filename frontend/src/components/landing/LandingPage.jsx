import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "./Landing.css";
import pawesomeLogo from "../../assets/pawesome.jpg";
import LandingChatbot from "../LandingChatbot";
import ServiceBookingModal from "./ServiceBookingModal";
import { useLandingPageContent } from "../../hooks/useLandingPageContent";
import DynamicHero from "./DynamicHero";
import DynamicFeaturedServices from "./DynamicFeaturedServices";
import DynamicAbout from "./DynamicAbout";
import { useAuth } from "../../context/AuthContext";

const LandingPage = () => {
  const currentYear = new Date().getFullYear();
  const [activeModal, setActiveModal] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, role } = useAuth();
  const { loading, getSection } = useLandingPageContent();
  const mobileNavRef = useRef(null);
  const mobileMenuButtonRef = useRef(null);
  const mobileMenuCloseRef = useRef(null);

  useEffect(() => {
    const serviceType = searchParams.get("book");
    if (!isAuthenticated || role !== "customer" || !["hotel", "grooming", "vet"].includes(serviceType)) return;
    setActiveModal(serviceType);
    setSearchParams({}, { replace: true });
  }, [isAuthenticated, role, searchParams, setSearchParams]);

  const scrollToServices = () => {
    const el = document.getElementById("featured-services-anchor");
    if (el) el.scrollIntoView({ behavior: "smooth" });
    setMobileNavOpen(false);
  };

  // Header scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setHeaderScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile nav on outside click
  useEffect(() => {
    if (!mobileNavOpen) return;
    const handleClick = (e) => {
      if (mobileNavRef.current && !mobileNavRef.current.contains(e.target)) {
        setMobileNavOpen(false);
      }
    };
    const handleResize = () => {
      if (window.innerWidth > 768) setMobileNavOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("resize", handleResize);
    };
  }, [mobileNavOpen]);

  // Lock scroll when the site menu is open.
  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const handleEscape = (event) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    mobileMenuCloseRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
      if (window.innerWidth <= 768) mobileMenuButtonRef.current?.focus();
    };
  }, [mobileNavOpen]);

  const navLinks = [
    { href: "#featured-services-anchor", label: "Services" },
    { href: "#about", label: "About" },
    { href: "#contact", label: "Contact" },
  ];

  return (
    <div className={`landing-container${loading ? " landing-content-loading" : ""}`}>
      <header className={`landing-header${headerScrolled ? " landing-header-scrolled" : ""}`}>
        <div className="landing-header-content">
          <a href="#home" className="landing-logo" aria-label="Pawesome Retreat home">
            <img
              src={pawesomeLogo}
              alt="Pawesome Retreat"
              className="landing-logo-image"
            />
            <div className="landing-logo-text">
              <strong>PAWESOME</strong>
              <span>RETREAT INC.</span>
            </div>
          </a>

          <nav className="landing-nav-links" aria-label="Main navigation">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href}>{link.label}</a>
            ))}
          </nav>

          <div className="landing-header-actions">
            {isAuthenticated && role === "customer" ? (
              <Link to="/customer/services" className="landing-header-register">My Services</Link>
            ) : (
              <>
                <Link to="/login" className="landing-header-login">Log In</Link>
                {!isAuthenticated && <Link to="/register" className="landing-header-register">Create Account</Link>}
                <Link to="/attendance-kiosk" className="landing-header-attendance">Employee Attendance</Link>
              </>
            )}
          </div>

          <button
            type="button"
            ref={mobileMenuButtonRef}
            className={`landing-hamburger${mobileNavOpen ? " open" : ""}`}
            aria-label={mobileNavOpen ? "Close site menu" : "Open site menu"}
            aria-expanded={mobileNavOpen}
            aria-controls="landing-site-menu"
            onClick={() => setMobileNavOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      {/* Site navigation drawer */}
      {mobileNavOpen && (
        <div className="landing-mobile-overlay" aria-hidden="true" onClick={() => setMobileNavOpen(false)} />
      )}
      <nav
        id="landing-site-menu"
        ref={mobileNavRef}
        className={`landing-mobile-nav${mobileNavOpen ? " open" : ""}`}
        aria-label="Site navigation and account menu"
        aria-hidden={!mobileNavOpen}
      >
        <div className="landing-mobile-nav-header">
          <a href="#home" className="landing-logo" onClick={() => setMobileNavOpen(false)}>
            <img src={pawesomeLogo} alt="Pawesome Retreat" className="landing-logo-image" />
            <div className="landing-logo-text">
              <strong>PAWESOME</strong>
              <span>RETREAT INC.</span>
            </div>
          </a>
          <button
            type="button"
            ref={mobileMenuCloseRef}
            className="landing-mobile-nav-close"
            aria-label="Close menu"
            onClick={() => setMobileNavOpen(false)}
          >
            &times;
          </button>
        </div>

        <div className="landing-mobile-nav-links">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setMobileNavOpen(false)}>
              {link.label}
            </a>
          ))}
        </div>

        <div className="landing-mobile-nav-actions">
          <div className="landing-mobile-nav-group">
            <span className="landing-mobile-nav-group-title">{isAuthenticated && role === "customer" ? "Customer Account" : "Account & Attendance"}</span>
            {isAuthenticated && role === "customer" ? (
              <>
                <Link to="/customer/services" className="landing-header-register" onClick={() => setMobileNavOpen(false)}>
                  My Services
                </Link>
                <Link to="/logout" className="landing-header-login" onClick={() => setMobileNavOpen(false)}>
                  Sign Out
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" className="landing-header-login" onClick={() => setMobileNavOpen(false)}>
                  Log In
                </Link>
                {!isAuthenticated && (
                  <Link to="/register" className="landing-header-register" onClick={() => setMobileNavOpen(false)}>
                    Create Account
                  </Link>
                )}
                <Link to="/attendance-kiosk" className="landing-header-attendance" onClick={() => setMobileNavOpen(false)}>
                  Employee Attendance
                </Link>
                {isAuthenticated && (
                  <Link to="/logout" className="landing-header-login" onClick={() => setMobileNavOpen(false)}>
                    Sign Out
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </nav>

      <main>
        <DynamicHero content={getSection("hero")} onBookService={scrollToServices} />

        <div id="featured-services-anchor">
          <DynamicFeaturedServices
            content={getSection("featured_services")}
            onBookService={(key) => setActiveModal(key)}
          />
        </div>

        <DynamicAbout content={getSection("about")} />
      </main>

      <footer id="contact" className="landing-footer">
        {(() => {
          const f = getSection("footer") || {};
          return (
            <>
              <div className="landing-footer-content">
                <div className="landing-footer-brand">
                  <div className="landing-footer-logo">
                    <img src={pawesomeLogo} alt="Pawesome Retreat" />
                    <div>
                      <strong>{f.brand_name || "Pawesome Retreat Inc."}</strong>
                      <span>{f.tagline || "Pet Hotel, Grooming, Supplies and Vet Clinic"}</span>
                    </div>
                  </div>
                  <p>{f.description || "A modern pet care center providing trusted services for pets and convenient support for owners."}</p>
                </div>

                <div className="landing-footer-section">
                  <h3>Contact</h3>
                  {f.phone && <p>{f.phone}</p>}
                  <p>{f.email || "pawesomeretreat24@gmail.com"}</p>
                  <p>{f.address || "Aldana Street San Isidro Village, Las Piñas, Philippines, 1740"}</p>
                  {(!isAuthenticated || role !== "customer") && (
                    <Link to="/attendance-kiosk" className="landing-footer-staff-link">Employee attendance</Link>
                  )}
                </div>
              </div>

              <div className="landing-footer-bottom">
                <p>© {currentYear} {f.brand_name || "Pawesome Retreat Inc."} All rights reserved.</p>
              </div>
            </>
          );
        })()}
      </footer>

      {activeModal && (
        <ServiceBookingModal
          serviceType={activeModal}
          onClose={() => setActiveModal(null)}
        />
      )}

      <LandingChatbot hidden={mobileNavOpen} />
    </div>
  );
};

export default LandingPage;
