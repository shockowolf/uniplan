type Metric = { label: string; value: string | number };

export function MetricCards({ metrics = [] }: { metrics?: Metric[] }) {
  if (!metrics.length) return null;

  return (
    <section className="metrics">
      {metrics.map((metric) => (
        <article className="metric-card" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </article>
      ))}
    </section>
  );
}
