import { ReactNode } from 'react';

type WorkspaceShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  switcher?: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function WorkspaceShell({ eyebrow, title, description, switcher, summary, children, className = '' }: WorkspaceShellProps) {
  return (
    <section className={`workspace-shell-card app-card app-surface app-page-content app-workspace-shell ${className}`.trim()}>
      <header className="workspace-shell-header app-page-header">
        <div className="workspace-shell-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="section-title workspace-shell-title">{title}</h1>
          <p className="copy section-copy">{description}</p>
        </div>
        {switcher ? <div className="workspace-shell-switcher">{switcher}</div> : null}
      </header>

      {summary ? <div className="workspace-shell-summary app-summary-region">{summary}</div> : null}

      <div className="workspace-shell-content app-section-stack">{children}</div>
    </section>
  );
}
