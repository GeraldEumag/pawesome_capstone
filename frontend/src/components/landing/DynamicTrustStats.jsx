const DEFAULT_STATS = {
  stats: [
    { value: "9+", label: "Core Services" },
    { value: "24/7", label: "Care Support" },
    { value: "100%", label: "Pet-Focused Care" },
  ],
};

const DynamicTrustStats = ({ content }) => {
  const data = content ?? DEFAULT_STATS;
  const stats = data.stats || DEFAULT_STATS.stats;

  return (
    <section className="landing-trust-strip" aria-label="Business highlights">
      {stats.map((stat) => (
        <div key={stat.label}>
          <strong>{stat.value}</strong>
          <span>{stat.label}</span>
        </div>
      ))}
    </section>
  );
};

export default DynamicTrustStats;
