import Link from 'next/link';
import { DashboardEmptyState } from './DashboardEmptyState';
import { DashboardSectionCard } from './DashboardSectionCard';

export type DashboardUpcomingOperationItem = {
  id: string;
  href: string;
  serviceName: string;
  bookingRef: string;
  dateLabel: string;
  supplierLabel: string;
  statusLabel: string;
  warningLabel?: string;
};

type UpcomingOperationsListProps = {
  items: DashboardUpcomingOperationItem[];
};

export function UpcomingOperationsList({ items }: UpcomingOperationsListProps) {
  return (
    <DashboardSectionCard
      eyebrow="Operations"
      title="Upcoming Operations"
      description="The next execution items that are likely to need operator attention."
      action={
        <Link href="/operations" className="dashboard-toolbar-link">
          Service queue
        </Link>
      }
    >
      {items.length === 0 ? (
        <DashboardEmptyState
          title="No upcoming operations"
          description="No dated booking services are currently scheduled in the immediate horizon."
        />
      ) : (
        <div className="executive-dashboard-list">
          {items.map((item) => (
            <Link key={item.id} href={item.href} className="executive-dashboard-list-row executive-dashboard-list-row-compact">
              <div className="executive-dashboard-list-row-copy">
                <strong>{item.serviceName}</strong>
                <p>{item.bookingRef}</p>
                <p>
                  {item.dateLabel} | {item.supplierLabel}
                </p>
              </div>
              <div className="executive-dashboard-list-row-aside">
                <span className="executive-dashboard-inline-pill">{item.statusLabel}</span>
                {item.warningLabel ? <span className="executive-dashboard-inline-note">{item.warningLabel}</span> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </DashboardSectionCard>
  );
}
