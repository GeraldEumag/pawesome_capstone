import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHotel, faScissors, faStethoscope } from "@fortawesome/free-solid-svg-icons";

const ICON_MAP = {
  hotel: faHotel,
  grooming: faScissors,
  vet: faStethoscope,
};

const DEFAULT_SERVICES = {
  eyebrow: "Our Services",
  headline: "Book the care your pet deserves",
  description: "Choose from our three core services and send a booking request in minutes.",
  services: [
    {
      key: "hotel",
      title: "Pet Hotel",
      description: "Safe, clean, and comfortable boarding facilities with 24/7 care for your pets while you are away.",
      cta: "Book Hotel",
      icon: "hotel",
    },
    {
      key: "grooming",
      title: "Grooming",
      description: "Professional grooming, hygiene, and spa care to keep your pet looking and feeling their best.",
      cta: "Book Grooming",
      icon: "grooming",
    },
    {
      key: "vet",
      title: "Veterinary Services",
      description: "Trusted veterinary consultations, vaccinations, diagnostics, and emergency care for every pet.",
      cta: "Book Vet Visit",
      icon: "vet",
    },
  ],
};

const DynamicFeaturedServices = ({ content, onBookService }) => {
  const data = content ?? DEFAULT_SERVICES;
  const configuredServices = new Map(
    (Array.isArray(data.services) ? data.services : [])
      .filter((service) => Object.prototype.hasOwnProperty.call(ICON_MAP, service.key))
      .map((service) => [service.key, service])
  );
  const services = DEFAULT_SERVICES.services.map((service) => ({
    ...service,
    ...configuredServices.get(service.key),
  }));

  return (
    <section className="landing-section landing-featured-services">
      <div className="landing-section-header">
        <span className="landing-eyebrow">{data.eyebrow}</span>
        <h2>{data.headline}</h2>
        <p>{data.description}</p>
      </div>

      <div className="landing-featured-grid">
        {services.map((service) => (
          <article className="landing-featured-card" key={service.key}>
            {service.image ? (
              <div className="featured-card-image">
                <img src={service.image} alt="" loading="lazy" decoding="async" />
              </div>
            ) : (
              <div className="featured-card-icon" aria-hidden="true">
                <FontAwesomeIcon icon={ICON_MAP[service.key] || faHotel} />
              </div>
            )}
            <h3>{service.title}</h3>
            <p>{service.description}</p>
            <button
              type="button"
              className="landing-btn landing-btn-primary"
              onClick={() => onBookService(service.key)}
            >
              {service.cta}
            </button>
          </article>
        ))}
      </div>

    </section>
  );
};

export default DynamicFeaturedServices;
