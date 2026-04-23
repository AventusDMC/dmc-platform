import { ReactNode } from 'react';

type BookingOperationsStatCardProps = {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  tone?: 'default' | 'accent';
  className?: string;
};

export function BookingOperationsStatCard({
  label,
  value,
  helper,
  tone = 'default',
  className = '',
}: BookingOperationsStatCardProps) {
  return (
    <article
      className={`booking-ops-stat-card${tone === 'accent' ? ' booking-ops-stat-card-accent' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      <span>{label}</span>
      <strong className="financial-value min-w-0 break-words tabular-nums">{value}</strong>
      {helper ? <p>{helper}</p> : null}
    </article>
  );
}
