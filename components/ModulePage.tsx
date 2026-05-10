type ModulePageProps = {
  eyebrow: string;
  title: string;
  description: string;
  metrics: { label: string; value: string | number }[];
  sections: { title: string; body: string }[];
};

export function ModulePage({ eyebrow, title, description, metrics, sections }: ModulePageProps) {
  return (
    <section className="dashboard-main">
      <header className="topbar">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        <div className="status-pill">Read-only · Template Safe</div>
      </header>

      <section className="metrics">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="module-panel">
        <p className="answer-text">{description}</p>
        <div className="module-grid">
          {sections.map((section) => (
            <article className="module-card" key={section.title}>
              <p className="eyebrow">Workspace</p>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
