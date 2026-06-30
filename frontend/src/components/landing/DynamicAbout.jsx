import pawesomeLogo from "../../assets/pawesome.jpg";
import facilityImg from "../../assets/facility 1.jpg";

const DEFAULT_ABOUT = {
  eyebrow: "About Pawesome Retreat",
  headline: "A care center built around pets and their owners.",
  description:
    "Pawesome Retreat Inc. is a pet care facility offering Pet Hotel, Grooming, Supplies, and Veterinary Clinic services. The center supports pet owners through laboratory services, vaccination, consultation, boarding, day care, grooming, supplies, accessories, and home veterinary service.",
  points: [
    { title: "Professional Care", description: "Handled by trained staff and service teams." },
    { title: "Clean Facilities", description: "Designed for comfort, safety, and organized pet handling." },
    { title: "Digital Workflow", description: "Supports reservations, tracking, and service records." },
  ],
};

const DynamicAbout = ({ content }) => {
  const data = content ?? DEFAULT_ABOUT;
  const points = data.points || DEFAULT_ABOUT.points;

  return (
    <section id="about" className="landing-about">
      <div className="landing-about-card">
        {(data.image || facilityImg) && (
          <div className="landing-about-image">
            <img src={data.image || facilityImg} alt="Pawesome Retreat facilities" />
          </div>
        )}
        <div className="landing-about-copy">
          <span className="landing-eyebrow">{data.eyebrow}</span>
          <h2>{data.headline}</h2>
          <p>{data.description}</p>

          <div className="landing-about-points">
            {points.map((point) => (
              <div key={point.title}>
                <strong>{point.title}</strong>
                <span>{point.description}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="landing-about-panel">
          <h3>Why customers choose Pawesome</h3>
          <ul>
            <li>Centralized veterinary and pet care services</li>
            <li>Customer account and pet profile management</li>
            <li>Organized service request and reservation tracking</li>
            <li>Reliable front desk and care coordination</li>
          </ul>
        </div>
      </div>
    </section>
  );
};

export default DynamicAbout;
