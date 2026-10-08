import { useEffect, useState } from "react";
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
  const images = [img1, img2, img3];
  const imageDescriptions = ["Pawesome pet hotel for dogs", "Comfortable cat boarding room", "Pet care play area"];
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener?.("change", update);
    return () => preference.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion) return undefined;
    const timer = window.setInterval(() => {
      setActiveImageIndex((current) => (current + 1) % images.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion, images.length]);

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
          </div>
          <div className="landing-hero-note">
            {(data.tags || DEFAULT_HERO.tags).map((tag, i) => {
              const label = typeof tag === "string" ? tag : tag?.value || "";
              return label ? <span key={i}>{label}</span> : null;
            })}
          </div>
        </div>

        {/* Layered photo collage */}
        <div className="landing-hero-visual">
          <div className="landing-hero-collage">
            {/* Dominant photo */}
            <div className="landing-collage-main" key={activeImageIndex}>
              <img
                src={images[activeImageIndex]}
                alt={imageDescriptions[activeImageIndex]}
                loading="eager"
                decoding="async"
                fetchpriority="high"
              />
              {/* Overlay label */}
              <div className="landing-collage-label">
                <span>Pawesome Retreat Inc.</span>
              </div>
            </div>

            {/* Tilted card, bottom-left */}
            <div className="landing-collage-card">
              <img
                src={img2}
                alt="Pet care facility"
                loading="lazy"
                decoding="async"
              />
            </div>

            {/* Circular badge, top-right */}
            <div className="landing-collage-dot">
              <img
                src={img3}
                alt="Pet playground"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
          <div className="landing-carousel-controls" role="group" aria-label="Hero photo controls">
            <span aria-live="off">{activeImageIndex + 1} / {images.length}</span>
            {reducedMotion ? (
              <span className="landing-motion-status">Motion minimized</span>
            ) : (
              <button type="button" onClick={() => setPaused((value) => !value)} aria-pressed={paused}>
                {paused ? "Play photos" : "Pause photos"}
              </button>
            )}
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
