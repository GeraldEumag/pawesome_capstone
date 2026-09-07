import { Link } from "react-router-dom";
import dogHotelImg from "../../assets/DOGHOTEL.jpg";
import catHotelImg from "../../assets/CATHOTEL.jpg";
import playgroundImg from "../../assets/play ground.jpg";

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

  const img1 = data.image || dogHotelImg;
  const img2 = data.image_2 || catHotelImg;
  const img3 = data.image_3 || playgroundImg;

  return (
    <section id="home" className="landing-hero">
      {/* Animated background blobs */}
      <div className="landing-blob landing-blob-1" aria-hidden="true" />
      <div className="landing-blob landing-blob-2" aria-hidden="true" />
      <div className="landing-blob landing-blob-3" aria-hidden="true" />

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

        {/* 3-Photo Mosaic */}
        <div className="landing-hero-visual">
          <div className="landing-hero-mosaic">
            {/* Floating star rating badge */}
            <div className="landing-mosaic-badge" aria-label="4.9 star rating">
              <span className="landing-mosaic-badge-stars">★★★★★</span>
              <span className="landing-mosaic-badge-text">Trusted Pet Care</span>
            </div>

            <div className="landing-mosaic-grid">
              {/* Left tall photo */}
              <div className="landing-mosaic-left">
                <img
                  src={img1}
                  alt="Pawesome pet hotel"
                  loading="lazy"
                />
              </div>
              {/* Right stacked photos */}
              <div className="landing-mosaic-right">
                <div className="landing-mosaic-top">
                  <img
                    src={img2}
                    alt="Pet care facility"
                    loading="lazy"
                  />
                </div>
                <div className="landing-mosaic-bottom">
                  <img
                    src={img3}
                    alt="Pet playground"
                    loading="lazy"
                  />
                  {/* Overlay label */}
                  <div className="landing-mosaic-overlay-label">
                    <span>Pawesome Retreat Inc.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating trust chip */}
            <div className="landing-mosaic-trust-chip">
              <span className="landing-mosaic-trust-icon">🐾</span>
              <span>200+ happy pet owners</span>
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
