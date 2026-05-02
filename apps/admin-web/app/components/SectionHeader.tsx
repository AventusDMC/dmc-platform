import { ReactNode } from 'react';

type SectionHeaderProps = {
  title: string;
  description?: string;
  context?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function SectionHeader({ title, description, context, actions, className = '' }: SectionHeaderProps) {
  return (
    <div className={`section-header-card app-section-header ${className}`.trim()}>
      <div className="section-header-copy">
        <h2 className="section-header-title">{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {context || actions ? (
        <div className="section-header-side">
          {context ? <div className="section-header-context">{context}</div> : null}
          {actions ? <div className="section-header-actions">{actions}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
