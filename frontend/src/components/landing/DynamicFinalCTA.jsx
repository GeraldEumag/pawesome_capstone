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
      <div>
        <span className="landing-eyebrow">{data.eyebrow}</span>
        <h2>{data.headline}</h2>
        <p>{data.description}</p>
        <div className="landing-cta-buttons">
          <Link to="/register" className="landing-btn landing-btn-primary">
            {data.primary_cta}
          </Link>
          <a href="#contact" className="landing-btn landing-btn-secondary">
            {data.secondary_cta}
          </a>
        </div>
      </div>
    </section>
  );
};

export default DynamicFinalCTA;
