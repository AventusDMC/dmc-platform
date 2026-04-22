import { ReactNode } from 'react';

type CompactFilterBarProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
};

export function CompactFilterBar({ eyebrow, title, description, children }: CompactFilterBarProps) {
  return (
    <section className="compact-filter-bar">
      <div className="compact-filter-bar-head">
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
