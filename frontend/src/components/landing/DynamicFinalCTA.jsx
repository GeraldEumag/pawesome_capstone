const DEFAULT_CTA = {
  eyebrow: "Customer Portal",
  headline: "Ready to book your pet's care?",
  description: "Choose a service, then sign in or create a customer account to book and track requests.",
  primary_cta: "Explore Services",
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
          <a href="#featured-services-anchor" className="landing-btn landing-btn-light">
            {data.primary_cta}
          </a>
          <a href="#contact" className="landing-btn landing-btn-outline-light">
            {data.secondary_cta}
          </a>
        </div>
      </div>
    </section>
  );
};

export default DynamicFinalCTA;
