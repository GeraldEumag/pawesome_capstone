import React from "react";
import { Link } from "react-router-dom";
import "./Landing.css";
import pawesomeLogo from "../../assets/pawesome.jpg";
import LandingChatbot from "../LandingChatbot";

const services = [
  {
    number: "01",
    title: "Laboratories",
    description: "CBC and blood chemistry testing for accurate pet diagnosis.",
  },
  {
    number: "02",
    title: "Vaccination",
    description: "Complete vaccination programs for disease prevention.",
  },
  {
    number: "03",
    title: "Consultation",
    description: "Professional veterinary consultations for pet health concerns.",
  },
  {
    number: "04",
    title: "Pet Boarding",
    description: "Safe, clean, and comfortable boarding facilities.",
  },
  {
    number: "05",
    title: "Pet Day Care",
    description: "Supervised daytime care for pets while owners are away.",
  },
  {
    number: "06",
    title: "Pet Party Events",
    description: "Special pet events and socialization activities.",
  },
  {
    number: "07",
    title: "Grooming",
    description: "Professional grooming, hygiene, and spa care services.",
  },
  {
    number: "08",
    title: "Supplies & Accessories",
    description: "Quality pet products, supplies, and daily care essentials.",
  },
  {
    number: "09",
    title: "Home Veterinary Service",
    description: "Professional veterinary care delivered to your doorstep.",
  },
];

const trustStats = [
  {
    value: "9+",
    label: "Core Services",
  },
  {
    value: "24/7",
    label: "Care Support",
  },
  {
    value: "100%",
    label: "Pet-Focused Care",
  },
];

const careSteps = [
  {
    title: "Create an Account",
    description: "Register as a customer and manage your pet information securely.",
  },
  {
    title: "Choose a Service",
    description: "Select veterinary, grooming, boarding, day care, or home service.",
  },
  {
    title: "Track Your Request",
    description: "Monitor booking status, approvals, schedules, and service updates.",
  },
];

const LandingPage = () => {
  const currentYear = new Date().getFullYear();

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
            <a href="#services">Services</a>
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
        <section id="home" className="landing-hero">
          <div className="landing-hero-content">
            <div className="landing-hero-copy">
              <span className="landing-eyebrow">
                Premium Pet Care & Veterinary Services
              </span>

              <h1>Trusted pet care made simple.</h1>

              <p>
                Pawesome Retreat Inc. provides veterinary services, pet hotel
                boarding, grooming, day care, supplies, and customer-friendly
                reservation support in one reliable pet care center.
              </p>

              <div className="landing-hero-buttons">
                <Link to="/register" className="landing-btn landing-btn-primary">
                  Create Customer Account
                </Link>
                <Link to="/login" className="landing-btn landing-btn-secondary">
                  Login to Portal
                </Link>
              </div>

              <div className="landing-hero-note">
                <span>Veterinary Clinic</span>
                <span>Pet Hotel</span>
                <span>Grooming</span>
                <span>Pet Supplies</span>
              </div>
            </div>

            <div className="landing-hero-visual">
              <div className="landing-showcase-card">
                <div className="landing-showcase-image">
                  <img
                    src={pawesomeLogo}
                    alt="Pawesome Retreat pet care center"
                  />
                </div>

                <div className="landing-showcase-body">
                  <span>Trusted Pet Care Center</span>
                  <h2>Pawesome Retreat Inc.</h2>
                  <p>Pet Hotel, Grooming, Supplies, and Veterinary Clinic</p>

                  <div className="landing-showcase-stats">
                    {trustStats.map((item) => (
                      <div key={item.label}>
                        <strong>{item.value}</strong>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-trust-strip" aria-label="Business highlights">
          <div>
            <strong>Veterinary Services</strong>
            <span>Consultation, vaccination, and laboratory support</span>
          </div>

          <div>
            <strong>Pet Hotel & Day Care</strong>
            <span>Safe boarding and supervised daily care</span>
          </div>

          <div>
            <strong>Customer Portal</strong>
            <span>Manage bookings, pets, and service requests</span>
          </div>
        </section>

        <section id="services" className="landing-section landing-services">
          <div className="landing-section-header">
            <span className="landing-eyebrow">Our Services</span>
            <h2>Everything your pet needs in one place</h2>
            <p>
              A complete pet care destination for health, comfort, grooming,
              boarding, and daily needs.
            </p>
          </div>

          <div className="landing-services-grid">
            {services.map((service) => (
              <article className="landing-service-card" key={service.number}>
                <span className="landing-service-number">{service.number}</span>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="about" className="landing-about">
          <div className="landing-about-card">
            <div className="landing-about-copy">
              <span className="landing-eyebrow">About Pawesome Retreat</span>
              <h2>A care center built around pets and their owners.</h2>
              <p>
                Pawesome Retreat Inc. is a pet care facility offering Pet Hotel,
                Grooming, Supplies, and Veterinary Clinic services. The center
                supports pet owners through laboratory services, vaccination,
                consultation, boarding, day care, grooming, supplies,
                accessories, and home veterinary service.
              </p>

              <div className="landing-about-points">
                <div>
                  <strong>Professional Care</strong>
                  <span>Handled by trained staff and service teams.</span>
                </div>

                <div>
                  <strong>Clean Facilities</strong>
                  <span>Designed for comfort, safety, and organized pet handling.</span>
                </div>

                <div>
                  <strong>Digital Workflow</strong>
                  <span>Supports reservations, tracking, and service records.</span>
                </div>
              </div>
            </div>

            <div className="landing-about-panel">
              <h3>Why customers choose Pawesome</h3>
              <ul>
                <li>Centralized veterinary and pet care services</li>
                <li>Customer account and pet profile management</li>
                <li>Organized service request and reservation tracking</li>
                <li>Reliable front desk and care coordination</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="process" className="landing-section landing-process">
          <div className="landing-section-header">
            <span className="landing-eyebrow">How It Works</span>
            <h2>Simple customer flow from account creation to service updates</h2>
          </div>

          <div className="landing-process-grid">
            {careSteps.map((step, index) => (
              <article className="landing-process-card" key={step.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-cta">
          <div>
            <span className="landing-eyebrow">Customer Portal</span>
            <h2>Ready to manage your pet care reservations online?</h2>
            <p>
              Create an account to start booking services, managing pet profiles,
              and tracking your requests.
            </p>
          </div>

          <div className="landing-cta-actions">
            <Link to="/register" className="landing-btn landing-btn-light">
              Register Now
            </Link>
            <Link to="/login" className="landing-btn landing-btn-outline-light">
              Login
            </Link>
          </div>
        </section>
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
            <a href="#services">Services</a>
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

      <LandingChatbot />
    </div>
  );
};

export default LandingPage;