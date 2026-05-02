type SummaryStripItem = {
  id: string;
  label: string;
  value: string;
  helper?: string;
};

type SummaryStripProps = {
  items: SummaryStripItem[];
  className?: string;
};

export function SummaryStrip({ items, className = '' }: SummaryStripProps) {
  return (
    <section className={`summary-strip app-summary-strip ${className}`.trim()} aria-label="Workspace summary">
      {items.map((item) => (
        <article key={item.id} className="summary-strip-card app-metric-card">
          <span className="summary-strip-label">{item.label}</span>
          <strong className="summary-strip-value">{item.value}</strong>
          {item.helper ? <p className="summary-strip-helper">{item.helper}</p> : null}
        </article>
      ))}
    </section>
  );
}
