import { ReactNode } from 'react';

type DashboardPanelProps = {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
};

export function DashboardPanel({ eyebrow, title, action, children }: DashboardPanelProps) {
  return (
    <section className="dashboard-panel">
      <header className="dashboard-panel-header">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {action ? <div className="dashboard-panel-action">{action}</div> : null}
      </header>
      <div className="dashboard-panel-body">{children}</div>
    </section>
  );
}
