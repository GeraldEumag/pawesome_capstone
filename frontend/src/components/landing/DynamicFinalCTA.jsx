import { Link } from "react-router-dom";

const DEFAULT_CTA = {
  eyebrow: "Customer Portal",
  headline: "Ready to book your pet's care?",
  description: "Create an account to manage your pets, book services, and track requests all in one place.",
  primary_cta: "Get Started",
  secondary_cta: "Contact Us",
};

const DynamicFinalCTA = ({ content }) => {
  const data = content ?? DEFAULT_CTA;

  return (
    <section className="landing-cta">
      {/* Decorative paw watermarks */}
      <div className="landing-cta-paw landing-cta-paw-left" aria-hidden="true">🐾</div>
      <div className="landing-cta-paw landing-cta-paw-right" aria-hidden="true">🐾</div>

      <div>
        <span className="landing-eyebrow">{data.eyebrow}</span>
        <h2>{data.headline}</h2>
        <p>{data.description}</p>
        {/* Fixed: was landing-cta-buttons, CSS expects landing-cta-actions */}
        <div className="landing-cta-actions">
          <Link to="/register" className="landing-btn landing-btn-light">
            {data.primary_cta}
          </Link>
          <a href="#contact" className="landing-btn landing-btn-outline-light">
            {data.secondary_cta}
          </a>
        </div>
      </div>
    </section>
  );
};

export default DynamicFinalCTA;
