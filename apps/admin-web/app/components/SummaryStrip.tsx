type SummaryStripItem = {
  id: string;
  label: string;
  value: string;
  helper?: string;
};

type SummaryStripProps = {
  items: SummaryStripItem[];
};

export function SummaryStrip({ items }: SummaryStripProps) {
  return (
    <section className="summary-strip" aria-label="Workspace summary">
      {items.map((item) => (
        <article key={item.id} className="summary-strip-card">
          <span className="summary-strip-label">{item.label}</span>
          <strong className="summary-strip-value">{item.value}</strong>
          {item.helper ? <p className="summary-strip-helper">{item.helper}</p> : null}
        </article>
      ))}
    </section>
  );
}
