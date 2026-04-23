import { ReactNode } from 'react';

type QuoteBuilderEmptyStateProps = {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function QuoteBuilderEmptyState({ eyebrow = 'Quote Builder', title, description, action }: QuoteBuilderEmptyStateProps) {
  return (
    <div className="quote-builder-empty-state">
      <p className="eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="quote-builder-empty-state-action">{action}</div> : null}
    </div>
  );
}
