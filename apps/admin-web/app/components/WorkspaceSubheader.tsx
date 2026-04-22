import { ReactNode } from 'react';

type WorkspaceSubheaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function WorkspaceSubheader({ eyebrow, title, description, actions }: WorkspaceSubheaderProps) {
  return (
    <header className="workspace-subheader">
      <div className="workspace-subheader-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="section-title workspace-subheader-title">{title}</h1>
        {description ? <p className="detail-copy">{description}</p> : null}
      </div>
      {actions ? <div className="workspace-subheader-actions">{actions}</div> : null}
    </header>
  );
}
