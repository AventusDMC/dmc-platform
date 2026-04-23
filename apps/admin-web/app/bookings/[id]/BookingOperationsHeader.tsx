import Link from 'next/link';
import { ReactNode } from 'react';

type BookingOperationsHeaderProps = {
  bookingId: string;
  bookingRef: string;
  title: string;
  companyName: string;
  contactName: string;
  travelSummary: string;
  badges: ReactNode;
  actions?: ReactNode;
};

export function BookingOperationsHeader({
  bookingId,
  bookingRef,
  title,
  companyName,
  contactName,
  travelSummary,
  badges,
  actions,
}: BookingOperationsHeaderProps) {
  return (
    <section className="booking-ops-header">
      <div className="booking-ops-header-copy">
        <div className="booking-ops-header-meta">
          <Link href="/bookings" className="back-link">
            Back to bookings
          </Link>
          <span className="booking-ops-header-slash">/</span>
          <span>{bookingRef || bookingId}</span>
        </div>
        <div className="booking-ops-title-row">
          <div>
            <p className="eyebrow">Booking Operations</p>
            <h1>{title}</h1>
          </div>
          <div className="booking-ops-header-badges">{badges}</div>
        </div>
        <div className="booking-ops-header-subtitle">
          <strong>{companyName}</strong>
          <span>{contactName}</span>
          <p>{travelSummary}</p>
        </div>
      </div>
      {actions ? <div className="booking-ops-header-actions">{actions}</div> : null}
    </section>
  );
}
