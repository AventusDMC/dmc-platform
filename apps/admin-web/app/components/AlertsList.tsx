import Link from 'next/link';
import { DashboardEmptyState } from './DashboardEmptyState';
import { DashboardSectionCard } from './DashboardSectionCard';

export type DashboardAlertItem = {
  id: string;
  title: string;
  detail: string;
  severity: 'critical' | 'warning' | 'info';
  href?: string;
};

type AlertsListProps = {
  alerts: DashboardAlertItem[];
};

export function AlertsList({ alerts }: AlertsListProps) {
  return (
    <DashboardSectionCard
      eyebrow="Attention"
      title="Operational Alerts"
      description="What needs immediate review across finance, operations, and rooming."
    >
      {alerts.length === 0 ? (
        <DashboardEmptyState title="No live alerts" description="The current bookings set does not show any urgent operational risk." />
      ) : (
        <div className="executive-dashboard-alert-list">
          {alerts.map((alert) => {
            const content = (
              <>
                <div className="executive-dashboard-alert-copy">
                  <strong>{alert.title}</strong>
                  <p>{alert.detail}</p>
                </div>
                <span className={`executive-dashboard-alert-badge executive-dashboard-alert-badge-${alert.severity}`}>
                  {alert.severity}
                </span>
              </>
            );

            return alert.href ? (
              <Link key={alert.id} href={alert.href} className={`executive-dashboard-alert executive-dashboard-alert-${alert.severity}`}>
                {content}
              </Link>
            ) : (
              <article key={alert.id} className={`executive-dashboard-alert executive-dashboard-alert-${alert.severity}`}>
                {content}
              </article>
            );
          })}
        </div>
      )}
    </DashboardSectionCard>
  );
}
