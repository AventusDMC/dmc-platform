import Link from 'next/link';
import { DashboardSectionCard } from './DashboardSectionCard';

export type DashboardQuickAction = {
  id: string;
  label: string;
  helper: string;
  href: string;
  primary?: boolean;
};

type QuickActionsCardProps = {
  actions: DashboardQuickAction[];
};

export function QuickActionsCard({ actions }: QuickActionsCardProps) {
  return (
    <DashboardSectionCard
      eyebrow="Next"
      title="Quick Actions"
      description="Jump straight into the next high-value workflow."
    >
      <div className="executive-dashboard-quick-actions">
        {actions.map((action) => (
          <Link
            key={action.id}
            href={action.href}
            className={action.primary ? 'executive-dashboard-quick-action executive-dashboard-quick-action-primary' : 'executive-dashboard-quick-action'}
          >
            <strong>{action.label}</strong>
            <p>{action.helper}</p>
          </Link>
        ))}
      </div>
    </DashboardSectionCard>
  );
}
