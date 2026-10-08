import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "./Landing.css";
import pawesomeLogo from "../../assets/pawesome.jpg";
import LandingChatbot from "../LandingChatbot";
import ServiceBookingModal from "./ServiceBookingModal";
import { useLandingPageContent } from "../../hooks/useLandingPageContent";
import DynamicHero from "./DynamicHero";
import DynamicFeaturedServices from "./DynamicFeaturedServices";
import DynamicHowItWorks from "./DynamicHowItWorks";
import DynamicAbout from "./DynamicAbout";
import DynamicFinalCTA from "./DynamicFinalCTA";
import DynamicFacilitiesGallery from "./DynamicFacilitiesGallery";
import DynamicTrustStats from "./DynamicTrustStats";
import { useAuth } from "../../context/AuthContext";

const LandingPage = () => {
  const currentYear = new Date().getFullYear();
  const [activeModal, setActiveModal] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, role } = useAuth();
  const { content, loading, error, getSection } = useLandingPageContent();
  const mobileNavRef = useRef(null);

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
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mobileNavOpen]);

  // Lock scroll when the site menu is open.
  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const handleEscape = (event) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

  const navLinks = [
    { href: "#featured-services-anchor", label: "Services" },
    { href: "#about", label: "About" },
    { href: "#process", label: "Process" },
    { href: "#contact", label: "Contact" },
  ];

  // Show a non-intrusive error banner if content failed to load (fallbacks still render)
  const errorBanner = error ? (
    <div
      style={{
        position: "fixed",
        bottom: "1.25rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        padding: "0.7rem 1.2rem",
        borderRadius: "999px",
        background: "rgba(220, 38, 38, 0.92)",
        color: "#fff",
        fontSize: "0.85rem",
        fontWeight: 800,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        whiteSpace: "nowrap",
        backdropFilter: "blur(8px)",
      }}
    >
      Could not load latest content — showing defaults.
    </div>
  ) : null;

  return (
    <div className={`landing-container${loading ? " landing-content-loading" : ""}`}>
      {errorBanner}

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

          {/* Menu toggle provides the consolidated account and staff entry points. */}
          <button
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
            <span className="landing-mobile-nav-group-title">{isAuthenticated && role !== "customer" ? "Staff Workspace" : "Customer Account"}</span>
            {isAuthenticated ? (
              <>
                <Link to={role === "customer" ? "/customer/services" : "/dashboard"} className="landing-header-register" onClick={() => setMobileNavOpen(false)}>
                  {role === "customer" ? "My Services" : "Staff Dashboard"}
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
                <Link to="/register" className="landing-header-register" onClick={() => setMobileNavOpen(false)}>
                  Create Account
                </Link>
              </>
            )}
          </div>
          {(!isAuthenticated || role !== "customer") && (
            <div className="landing-mobile-nav-group landing-mobile-nav-staff">
              <span className="landing-mobile-nav-group-title">Staff Access</span>
              <Link to="/attendance-kiosk" className="landing-header-attendance" onClick={() => setMobileNavOpen(false)}>
                Employee Attendance
              </Link>
            </div>
          )}
        </div>
      </nav>

      <main>
        <DynamicHero content={getSection("hero")} onBookService={scrollToServices} />

        <DynamicFacilitiesGallery content={getSection("facilities_gallery")} />

        <DynamicTrustStats content={getSection("trust_stats")} />

        <div id="featured-services-anchor">
          <DynamicFeaturedServices
            content={getSection("featured_services")}
            onBookService={(key) => setActiveModal(key)}
          />
        </div>

        <DynamicHowItWorks content={getSection("how_it_works")} />

        <DynamicAbout content={getSection("about")} />

        <DynamicFinalCTA content={getSection("final_cta")} />
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
                  <h3>Quick Links</h3>
                  <a href="#featured-services-anchor">Services</a>
                  <a href="#about">About</a>
                  <a href="#process">Process</a>
                  <a href="#contact">Contact</a>
                </div>

                <div className="landing-footer-section">
                  <h3>Contact</h3>
                  {f.phone && <p>{f.phone}</p>}
                  <p>{f.email || "pawesomeretreat24@gmail.com"}</p>
                  <p>{f.address || "Aldana Street San Isidro Village, Las Piñas, Philippines, 1740"}</p>
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

      <LandingChatbot />
    </div>
  );
};

export default LandingPage;
