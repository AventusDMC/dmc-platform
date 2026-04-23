import Link from 'next/link';
import { AcceptInviteForm } from './AcceptInviteForm';

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = String(params.token || '');

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <div className="workspace-shell">
          <div className="workspace-subheader">
            <p className="eyebrow">Invitation</p>
            <h1>Join your company</h1>
            <p>Accept your team invitation and create your account.</p>
          </div>

          {token ? <AcceptInviteForm token={token} /> : <p className="form-error">Invitation token is missing.</p>}

          <p className="form-helper">
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
