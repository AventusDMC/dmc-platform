import './globals.css';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';
import { AdminChromeNav } from './components/AdminChromeNav';
import { readSessionActor } from './lib/auth-session';

export const metadata: Metadata = {
  title: 'DMC Admin',
  description: 'Admin interface for the DMC travel platform',
};

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const pathname = requestHeaders.get('x-dmc-pathname') || '/';
  const sessionToken = cookieStore.get('dmc_session')?.value || '';
  const session = readSessionActor(sessionToken);
  const isPublicRoute = pathname === '/login' || pathname.startsWith('/portal') || pathname.startsWith('/invoice');
  const isDashboardRoute = pathname === '/' || pathname === '/dashboard';

  if (!isPublicRoute && !sessionToken) {
    redirect(`/login?reason=session-expired&next=${encodeURIComponent(pathname)}`);
  }

  if (pathname === '/login' && sessionToken) {
    redirect('/');
  }

  return (
    <html lang="en">
      <body>
        {isPublicRoute ? (
          children
        ) : (
          <div className="admin-shell">
            <aside className="admin-sidebar">
              <div className="admin-sidebar-brand">
                <p className="eyebrow">DMC Platform</p>
                <h1 className="admin-brand-title">Admin Workspace</h1>
                <p className="admin-sidebar-copy">Operational control, products, suppliers, and finance in one compact shell.</p>
              </div>

              <AdminChromeNav mode="primary" sessionRole={session?.role} />

              <div className="admin-sidebar-subnav">
                <AdminChromeNav mode="subnav" sessionRole={session?.role} />
              </div>

              <div className="admin-sidebar-footer">
                {session ? (
                  <div className="admin-account-copy">
                    <strong>{session.name}</strong>
                    <span>{session.role}</span>
                  </div>
                ) : null}
              </div>
            </aside>

            <div className="admin-main-shell">
              <header className="site-header admin-header">
                <div className="admin-topbar">
                  {!isDashboardRoute ? <AdminChromeNav mode="topbar" sessionRole={session?.role} /> : null}

                  <div className="admin-account">
                    {session ? (
                      <>
                        <div className="admin-account-copy">
                          <strong>{session.name}</strong>
                          <span>{session.role}</span>
                        </div>
                        <form action="/api/auth/logout" method="POST">
                          <button type="submit" className="secondary-button">
                            Sign out
                          </button>
                        </form>
                      </>
                    ) : (
                      <Link href="/login">Sign in</Link>
                    )}
                  </div>
                </div>

                {!isDashboardRoute ? (
                  <div className="admin-subnav-shell">
                    <div className="admin-subnav">
                      <AdminChromeNav mode="subnav" sessionRole={session?.role} />
                    </div>
                  </div>
                ) : null}
              </header>

              <div className="admin-content-shell">{children}</div>
            </div>
          </div>
        )}
      </body>
    </html>
  );
}
