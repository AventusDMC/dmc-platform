import { ReactNode } from 'react';

type DashboardSectionCardProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function DashboardSectionCard({
  eyebrow,
  title,
  description,
  action,
  children,
  className = '',
}: DashboardSectionCardProps) {
  return (
    <section className={`executive-dashboard-section-card ${className}`.trim()}>
      <header className="executive-dashboard-section-head">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="executive-dashboard-section-action">{action}</div> : null}
      </header>
      <div className="executive-dashboard-section-body">{children}</div>
    </section>
  );
}
