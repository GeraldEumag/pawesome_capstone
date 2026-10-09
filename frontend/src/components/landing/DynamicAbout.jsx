import facilityImg from "../../assets/facility 1.jpg";

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

const DynamicAbout = ({ content }) => {
  const data = content ?? DEFAULT_ABOUT;
  const points = (Array.isArray(data.points) ? data.points : DEFAULT_ABOUT.points).slice(0, 3);

  return (
    <section id="about" className="landing-about">
      <div className="landing-about-card">
        <div className="landing-about-image">
          <img src={data.image || facilityImg} alt="Pawesome Retreat pet care facility" loading="lazy" decoding="async" />
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
