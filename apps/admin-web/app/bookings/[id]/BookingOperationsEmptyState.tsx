import { ReactNode } from 'react';

type BookingOperationsEmptyStateProps = {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function BookingOperationsEmptyState({
  eyebrow = 'Booking Operations',
  title,
  description,
  action,
}: BookingOperationsEmptyStateProps) {
  return (
    <div className="booking-ops-empty-state">
      <p className="eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="booking-ops-empty-state-action">{action}</div> : null}
    </div>
  );
}
