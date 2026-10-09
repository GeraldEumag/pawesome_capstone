import dogHotelImg from "../../assets/DOGHOTEL.jpg";

const DEFAULT_HERO = {
  eyebrow: "Pet hotel, grooming & veterinary care",
  headline: "Thoughtful care for every member of your family.",
  description:
    "Find trusted boarding, grooming, and veterinary services for your pet—all in one welcoming place.",
  primary_cta: "Explore services",
};

const DynamicHero = ({ content, onBookService }) => {
  const data = content ?? DEFAULT_HERO;

  return (
    <section id="home" className="landing-hero">
      <div className="landing-hero-content">
        <div className="landing-hero-copy">
          {data.eyebrow && <span className="landing-eyebrow">{data.eyebrow}</span>}
          <h1>{data.headline}</h1>
          <p>{data.description}</p>
          <div className="landing-hero-buttons">
            <button
              type="button"
              className="landing-btn landing-btn-primary"
              onClick={onBookService}
            >
              {data.primary_cta || DEFAULT_HERO.primary_cta}
            </button>
          </div>
        </div>

        <div className="landing-hero-visual">
          <img
            className="landing-hero-image"
            src={data.image || dogHotelImg}
            alt="A comfortable pet care space at Pawesome Retreat"
            fetchpriority="high"
            decoding="async"
          />
        </div>
      </div>
    </section>
  );
};

export default DynamicHero;
