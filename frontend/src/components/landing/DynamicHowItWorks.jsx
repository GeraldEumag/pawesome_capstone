const DEFAULT_STEPS = {
  eyebrow: "How It Works",
  headline: "Simple steps from booking to service",
  steps: [
    {
      number: "01",
      title: "Create an Account",
      description: "Register as a customer and manage your pet information securely.",
    },
    {
      number: "02",
      title: "Choose a Service",
      description: "Select veterinary, grooming, boarding, day care, or home service.",
    },
    {
      number: "03",
      title: "Track Your Request",
      description: "Monitor booking status, approvals, schedules, and service updates.",
    },
  ],
};

const DynamicHowItWorks = ({ content }) => {
  const data = content ?? DEFAULT_STEPS;
  const steps = data.steps || DEFAULT_STEPS.steps;

  return (
    <section id="process" className="landing-section landing-process">
      <div className="landing-section-header">
        <span className="landing-eyebrow">{data.eyebrow}</span>
        <h2>{data.headline}</h2>
      </div>

      <div className="landing-process-wrapper">
        <div className="landing-process-grid">
          {steps.map((step, index) => (
            <article className="landing-process-card" key={step.title}>
              <div className="landing-step-circle">
                {step.number || String(index + 1).padStart(2, "0")}
              </div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default DynamicHowItWorks;
