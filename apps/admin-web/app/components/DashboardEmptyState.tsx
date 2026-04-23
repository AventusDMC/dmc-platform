import { ReactNode } from 'react';

type DashboardEmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function DashboardEmptyState({ title, description, action }: DashboardEmptyStateProps) {
  return (
    <div className="executive-dashboard-empty-state">
      <strong>{title}</strong>
      <p>{description}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
