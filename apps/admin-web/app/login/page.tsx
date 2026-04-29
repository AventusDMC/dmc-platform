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

function getSafeNextPath(next?: string) {
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/admin/dashboard';
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const nextPath = getSafeNextPath(resolvedSearchParams?.next);
  const message = getLoginMessage(resolvedSearchParams?.reason);

  return (
    <main className="page login-page">
      <section className="detail-card login-card">
        <div className="login-brand-logo-wrapper">
          <img src="/axis-logo.png" alt="AXIS" className="login-brand-logo" />
        </div>
        <p className="eyebrow">DMC Admin</p>
        <h1>Sign in to your workspace</h1>
        <p className="copy">Access sales, operations, product, finance, and reporting workflows from one secure admin console.</p>
        <LoginForm nextPath={nextPath} initialMessage={message} />
      </section>
    </main>
  );
}
