import { ReactNode } from 'react';

type QuoteBuilderStatCardProps = {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  tone?: 'default' | 'accent';
};

export function QuoteBuilderStatCard({ label, value, helper, tone = 'default' }: QuoteBuilderStatCardProps) {
  return (
    <article className={`quote-builder-stat-card${tone === 'accent' ? ' quote-builder-stat-card-accent' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <p>{helper}</p> : null}
    </article>
  );
}
