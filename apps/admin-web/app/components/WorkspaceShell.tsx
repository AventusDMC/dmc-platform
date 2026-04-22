import { ReactNode } from 'react';

type WorkspaceShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  switcher?: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
};

export function WorkspaceShell({ eyebrow, title, description, switcher, summary, children }: WorkspaceShellProps) {
  return (
    <section className="workspace-shell-card">
      <header className="workspace-shell-header">
        <div className="workspace-shell-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="section-title workspace-shell-title">{title}</h1>
          <p className="copy section-copy">{description}</p>
        </div>
        {switcher ? <div className="workspace-shell-switcher">{switcher}</div> : null}
      </header>

      {summary ? <div className="workspace-shell-summary">{summary}</div> : null}

      <div className="workspace-shell-content">{children}</div>
    </section>
  );
}
