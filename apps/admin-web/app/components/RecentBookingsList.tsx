import Link from 'next/link';
import { DashboardEmptyState } from './DashboardEmptyState';
import { DashboardSectionCard } from './DashboardSectionCard';

export type DashboardBookingListItem = {
  id: string;
  href: string;
  title: string;
  reference: string;
  client: string;
  travelLabel: string;
  statusLabel: string;
  statusTone: 'neutral' | 'accent' | 'warning';
};

type RecentBookingsListProps = {
  bookings: DashboardBookingListItem[];
};

export function RecentBookingsList({ bookings }: RecentBookingsListProps) {
  return (
    <DashboardSectionCard
      eyebrow="Delivery"
      title="Recent Bookings"
      description="Execution records opened most recently across the operation."
      action={
        <Link href="/bookings" className="dashboard-toolbar-link">
          View all
        </Link>
      }
    >
      {bookings.length === 0 ? (
        <DashboardEmptyState
          title="No bookings yet"
          description="Bookings will show here once accepted quotes move into delivery."
          action={
            <Link href="/quotes" className="secondary-button">
              Open quotes
            </Link>
          }
        />
      ) : (
        <div className="executive-dashboard-list">
          {bookings.map((booking) => (
            <Link key={booking.id} href={booking.href} className="executive-dashboard-list-row">
              <div className="executive-dashboard-list-row-copy">
                <strong>{booking.title}</strong>
                <p>{booking.client}</p>
                <p>
                  {booking.reference} | {booking.travelLabel}
                </p>
              </div>
              <div className="executive-dashboard-list-row-aside">
                <span className={`executive-dashboard-inline-pill executive-dashboard-inline-pill-${booking.statusTone}`}>
                  {booking.statusLabel}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </DashboardSectionCard>
  );
}
