import { Link } from "react-router-dom";
import pawesomeLogo from "../../assets/pawesome.jpg";

const DEFAULT_HERO = {
  eyebrow: "Premium Pet Care & Veterinary Services",
  headline: "Trusted pet care made simple.",
  description:
    "Pawesome Retreat Inc. provides veterinary services, pet hotel boarding, grooming, day care, supplies, and customer-friendly reservation support in one reliable pet care center.",
  primary_cta: "Book a Service",
  secondary_cta: "Login to Portal",
  tags: ["Veterinary Clinic", "Pet Hotel", "Grooming", "Pet Supplies"],
};

const DynamicHero = ({ content, onBookService }) => {
  const data = content ?? DEFAULT_HERO;

  return (
    <section id="home" className="landing-hero" style={{ position: "relative" }}>
      <div className="landing-hero-content">
        <div className="landing-hero-copy">
          <span className="landing-eyebrow">{data.eyebrow}</span>
          <h1>{data.headline}</h1>
          <p>{data.description}</p>
          <div className="landing-hero-buttons">
            <button
              className="landing-btn landing-btn-primary"
              onClick={onBookService}
            >
              {data.primary_cta}
            </button>
            <Link to="/login" className="landing-btn landing-btn-secondary">
              {data.secondary_cta}
            </Link>
          </div>
          <div className="landing-hero-note">
            {(data.tags || DEFAULT_HERO.tags).map((tag, i) => {
              const label = typeof tag === "string" ? tag : tag?.value || "";
              return label ? <span key={i}>{label}</span> : null;
            })}
          </div>
        </div>

        <div className="landing-hero-visual">
          <div className="landing-showcase-card">
            <div className="landing-showcase-image">
              <img
                src={data.image || pawesomeLogo}
                alt="Pawesome Retreat pet care center"
              />
            </div>
            <div className="landing-showcase-body">
              <span>Trusted Pet Care Center</span>
              <h2>Pawesome Retreat Inc.</h2>
              <p>Pet Hotel, Grooming, Supplies, and Veterinary Clinic</p>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="landing-scroll-indicator" aria-hidden="true">
        <span>Scroll</span>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 6.5L9 12.5L15 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </section>
  );
};

export default DynamicHero;
