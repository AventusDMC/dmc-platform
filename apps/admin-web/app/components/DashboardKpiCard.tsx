import { ReactNode } from 'react';

type DashboardKpiCardProps = {
  label: string;
  value: string;
  description?: string;
  action?: ReactNode;
  tone?: 'default' | 'alert';
};

export function DashboardKpiCard({ label, value, description, action, tone = 'default' }: DashboardKpiCardProps) {
  return (
    <article className={`dashboard-kpi-card${tone === 'alert' ? ' dashboard-kpi-card-alert' : ''}`}>
      <div className="dashboard-kpi-head">
        <span>{label}</span>
        {action ? <div className="dashboard-kpi-action">{action}</div> : null}
      </div>
      <strong>{value}</strong>
      {description ? <p>{description}</p> : null}
    </article>
  );
}
