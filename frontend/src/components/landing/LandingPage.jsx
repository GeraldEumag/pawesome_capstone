import { useState } from "react";
import { Link } from "react-router-dom";
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
import DynamicTrustStats from "./DynamicTrustStats";

const LandingPage = () => {
  const currentYear = new Date().getFullYear();
  const [activeModal, setActiveModal] = useState(null);
  const { content, getSection } = useLandingPageContent();

  const scrollToServices = () => {
    const el = document.getElementById("featured-services-anchor");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="landing-container">
      <header className="landing-header">
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
            <a href="#featured-services-anchor">Services</a>
            <a href="#about">About</a>
            <a href="#process">Process</a>
            <a href="#contact">Contact</a>
          </nav>

          <div className="landing-header-actions">
            <Link to="/login" className="landing-header-login">
              Login
            </Link>
            <Link to="/register" className="landing-header-register">
              Register
            </Link>
          </div>
        </div>
      </header>

      <main>
        <DynamicHero content={getSection("hero")} onBookService={scrollToServices} />

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
        <div className="landing-footer-content">
          <div className="landing-footer-brand">
            <div className="landing-footer-logo">
              <img src={pawesomeLogo} alt="Pawesome Retreat" />
              <div>
                <strong>Pawesome Retreat Inc.</strong>
                <span>Pet Hotel, Grooming, Supplies and Vet Clinic</span>
              </div>
            </div>

            <p>
              A modern pet care center providing trusted services for pets and
              convenient support for owners.
            </p>
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
            <p>pawesomeretreat24@gmail.com</p>
            <p>Aldana Street San Isidro Village, Las Piñas, Philippines, 1740</p>
          </div>
        </div>

        <div className="landing-footer-bottom">
          <p>© {currentYear} Pawesome Retreat Inc. All rights reserved.</p>
        </div>
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