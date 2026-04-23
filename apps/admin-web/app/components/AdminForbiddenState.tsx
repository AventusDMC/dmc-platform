import { ReactNode } from 'react';

type AdminForbiddenStateProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
};

export function AdminForbiddenState({
  title = 'Permission required',
  description = 'You are signed in, but your account does not have permission to view this area. If this looks incorrect, ask an administrator to review your role access.',
  action,
}: AdminForbiddenStateProps) {
  return (
    <main className="page">
      <section className="detail-card" style={{ maxWidth: 640 }}>
        <p className="eyebrow">Access denied</p>
        <h1>{title}</h1>
        <p className="detail-copy">{description}</p>
        {action ? <div>{action}</div> : null}
      </section>
    </main>
  );
}
