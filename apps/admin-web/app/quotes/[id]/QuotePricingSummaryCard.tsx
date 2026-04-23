import { ReactNode } from 'react';

type QuotePricingSummaryCardProps = {
  className?: string;
  eyebrow: string;
  title: string;
  items: Array<{
    label: string;
    value: ReactNode;
    helper?: ReactNode;
  }>;
  footer?: ReactNode;
};

export function QuotePricingSummaryCard({ className = '', eyebrow, title, items, footer }: QuotePricingSummaryCardProps) {
  return (
    <article className={`quote-pricing-summary-card${className ? ` ${className}` : ''}`}>
      <div className="quote-pricing-summary-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="quote-pricing-summary-list">
        {items.map((item) => (
          <div key={item.label} className="quote-pricing-summary-row">
            <span className="min-w-0">{item.label}</span>
            <div className="financial-value-shell min-w-0 break-words">
              <strong className="financial-value min-w-0 break-words tabular-nums">{item.value}</strong>
              {item.helper ? <p>{item.helper}</p> : null}
            </div>
          </div>
        ))}
      </div>
      {footer ? <div className="quote-pricing-summary-footer">{footer}</div> : null}
    </article>
  );
}
