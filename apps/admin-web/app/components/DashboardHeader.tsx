import { ReactNode } from 'react';

type DashboardHeaderProps = {
  title: string;
  subtitle: string;
  actions?: ReactNode;
};

export function DashboardHeader({ title, subtitle, actions }: DashboardHeaderProps) {
  return (
    <header className="executive-dashboard-header">
      <div className="executive-dashboard-header-copy">
        <p className="eyebrow">Dashboard</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actions ? <div className="executive-dashboard-header-actions">{actions}</div> : null}
    </header>
  );
}
