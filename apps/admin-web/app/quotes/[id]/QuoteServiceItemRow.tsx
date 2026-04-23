import { ReactNode } from 'react';

type QuoteServiceItemRowProps = {
  title: string;
  category: string;
  summary: string;
  meta: string;
  badge?: ReactNode;
  actions?: ReactNode;
  notes?: string | null;
};

export function QuoteServiceItemRow({ title, category, summary, meta, badge, actions, notes }: QuoteServiceItemRowProps) {
  return (
    <div className="quote-service-item-row">
      <div className="quote-service-item-main">
        <div className="quote-service-item-heading">
          <div>
            <strong>{title}</strong>
            <span>{category}</span>
          </div>
          {badge ? <div className="quote-service-item-badge">{badge}</div> : null}
        </div>
        <p>{summary}</p>
        <div className="quote-service-item-meta">
          <span>{meta}</span>
          {notes ? <span>{notes}</span> : null}
        </div>
      </div>
      {actions ? <div className="quote-service-item-actions">{actions}</div> : null}
    </div>
  );
}
