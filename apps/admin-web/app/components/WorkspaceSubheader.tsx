import { ReactNode } from 'react';

type WorkspaceSubheaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function WorkspaceSubheader({ eyebrow, title, description, actions, className = '' }: WorkspaceSubheaderProps) {
  return (
    <header className={`workspace-subheader app-section-header ${className}`.trim()}>
      <div className="workspace-subheader-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="section-title workspace-subheader-title">{title}</h1>
        {description ? <p className="detail-copy">{description}</p> : null}
      </div>
      {actions ? <div className="workspace-subheader-actions">{actions}</div> : null}
    </header>
  );
}
