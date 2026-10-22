import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { DEFAULT_ABOUT_PHOTOS } from "./aboutPhotos";

const DEFAULT_ABOUT = {
  eyebrow: "Why Pawesome",
  headline: "Care that feels personal.",
  description:
    "From everyday grooming to a comfortable stay or a veterinary visit, our team helps make pet care easier for your whole family.",
  points: [
    { title: "A welcoming team", description: "Friendly support for pets and the people who love them." },
    { title: "Care in one place", description: "Boarding, grooming, and veterinary services together." },
    { title: "Easy to plan", description: "Request a service and follow your booking online." },
  ],
};

const resolvePhotos = (data) => {
  if (Array.isArray(data.photos) && data.photos.some((photo) => photo?.image)) {
    return data.photos.filter((photo) => photo?.image).slice(0, 6);
  }
  if (data.image) return [{ image: data.image, caption: "Our facility" }];
  return DEFAULT_ABOUT_PHOTOS;
};

const DynamicAbout = ({ content }) => {
  const data = content ?? DEFAULT_ABOUT;
  const points = (Array.isArray(data.points) ? data.points : DEFAULT_ABOUT.points).slice(0, 3);
  const photos = resolvePhotos(data);
  const [activeIdx, setActiveIdx] = useState(0);
  const activePhoto = photos[activeIdx] ?? photos[0];

  return (
    <section id="about" className="landing-about">
      <div className="landing-about-card">
        <div className="landing-about-image">
          <img
            key={activePhoto.image}
            src={activePhoto.image}
            alt={activePhoto.caption || "Pawesome Retreat pet care facility"}
            loading="lazy"
            decoding="async"
          />
          {photos.length > 1 && (
            <>
              <button
                type="button"
                className="landing-about-arrow landing-about-arrow-prev"
                aria-label="Previous facility photo"
                onClick={() => setActiveIdx((idx) => (idx - 1 + photos.length) % photos.length)}
              >
                <FontAwesomeIcon icon={faChevronLeft} />
              </button>
              <button
                type="button"
                className="landing-about-arrow landing-about-arrow-next"
                aria-label="Next facility photo"
                onClick={() => setActiveIdx((idx) => (idx + 1) % photos.length)}
              >
                <FontAwesomeIcon icon={faChevronRight} />
              </button>
            </>
          )}
        </div>

        <div className="landing-about-copy">
          {data.eyebrow && <span className="landing-eyebrow">{data.eyebrow}</span>}
          <h2>{data.headline}</h2>
          <p>{data.description}</p>

          {points.length > 0 && (
            <ul className="landing-about-points">
              {points.map((point) => (
                <li key={point.title}>
                  <strong>{point.title}</strong>
                  {point.description && <span>{point.description}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};

export default DynamicAbout;
