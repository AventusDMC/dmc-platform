import { ReactNode } from 'react';

type CompactFilterBarProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function CompactFilterBar({ eyebrow, title, description, children, className = '' }: CompactFilterBarProps) {
  return (
    <section className={`compact-filter-bar app-filter-panel ${className}`.trim()}>
      <div className="compact-filter-bar-head app-section-header">
        <div className="compact-filter-bar-copy">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2 className="compact-filter-bar-title">{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      <div className="compact-filter-bar-body">{children}</div>
    </section>
  );
}
