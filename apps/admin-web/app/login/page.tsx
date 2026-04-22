import { LoginForm } from './LoginForm';

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string;
    reason?: string;
  }>;
};

function getLoginMessage(reason?: string) {
  if (reason === 'session-expired') {
    return 'Your session expired. Sign in again to continue.';
  }

  if (reason === 'permission-denied') {
    return 'You are signed in, but you do not have permission to access that area.';
  }

  return '';
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const nextPath = resolvedSearchParams?.next || '/';
  const message = getLoginMessage(resolvedSearchParams?.reason);

  return (
    <main className="page">
      <section className="detail-card" style={{ maxWidth: 520 }}>
        <p className="eyebrow">Authentication</p>
        <h1>Sign in to DMC Admin</h1>
        <p className="copy">Use one of the seeded platform users to get a role-backed session for booking, pricing, and rate changes.</p>
        <LoginForm nextPath={nextPath} initialMessage={message} />
      </section>
    </main>
  );
}
