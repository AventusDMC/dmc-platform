import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';
import { AdminChromeNav } from './components/AdminChromeNav';
import { readSessionActor } from './lib/auth-session';

type RootTemplateProps = {
  children: ReactNode;
};

const PUBLIC_ROUTE_PREFIXES = ['/portal', '/invoice', '/proposal', '/q'];
const PUBLIC_ROUTE_PATHS = new Set(['/login', '/signup', '/accept-invite']);
const PROTECTED_ADMIN_ROUTE_PREFIXES = ['/admin', '/agents', '/quotes', '/bookings', '/finance', '/catalog', '/excursion-templates'];

function normalizePathname(value: string | null) {
  const pathname = value?.trim() || '/';
  const [withoutQuery] = pathname.split('?');
  return withoutQuery || '/';
}

function matchesPathPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isPublicPath(pathname: string) {
  return PUBLIC_ROUTE_PATHS.has(pathname) || PUBLIC_ROUTE_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
}

function isProtectedAdminPath(pathname: string) {
  return pathname === '/' || pathname === '/dashboard' || PROTECTED_ADMIN_ROUTE_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
}

export default async function RootTemplate({ children }: RootTemplateProps) {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const pathname = normalizePathname(requestHeaders.get('x-dmc-pathname') || requestHeaders.get('next-url'));
  const sessionToken = cookieStore.get('dmc_session')?.value || '';
  const session = readSessionActor(sessionToken);
  const isProtectedAdminRoute = isProtectedAdminPath(pathname);
  const isPublicRoute = !isProtectedAdminRoute && isPublicPath(pathname);
  const isAgentRoute = pathname.startsWith('/agent');
  const isDashboardRoute = pathname === '/' || pathname === '/dashboard' || pathname === '/admin/dashboard';

  if (!isPublicRoute && !session) {
    redirect(`/login?reason=session-expired&next=${encodeURIComponent(pathname)}`);
  }

  if (pathname === '/login' && session) {
    redirect(session.role === 'agent' ? '/agent/dashboard' : '/admin/dashboard');
  }

  if (session?.role === 'agent' && !isPublicRoute && !isAgentRoute) {
    redirect('/agent/dashboard');
  }

  if (isPublicRoute) {
    return children;
  }

  if (isAgentRoute) {
    return (
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-sidebar-brand">
            <div className="admin-brand-row">
              <img src="/axis-logo.png" alt="AXIS" className="admin-brand-logo" />
            </div>
            <p className="admin-sidebar-copy">Quotes, bookings, invoices, and shared proposals for your assigned business.</p>
          </div>

          <nav className="admin-sidebar-nav" aria-label="Agent">
            <Link href="/agent/dashboard" className={`admin-top-nav-link${pathname === '/agent/dashboard' ? ' admin-top-nav-link-active' : ''}`}>
              <strong>Dashboard</strong>
              <span>Business overview</span>
            </Link>
            <Link href="/agent/quotes" className={`admin-top-nav-link${pathname.startsWith('/agent/quotes') ? ' admin-top-nav-link-active' : ''}`}>
              <strong>Quotes</strong>
              <span>Active proposals</span>
            </Link>
            <Link href="/agent/bookings" className={`admin-top-nav-link${pathname.startsWith('/agent/bookings') ? ' admin-top-nav-link-active' : ''}`}>
              <strong>Bookings</strong>
              <span>Confirmed travel</span>
            </Link>
            <Link href="/agent/invoices" className={`admin-top-nav-link${pathname.startsWith('/agent/invoices') ? ' admin-top-nav-link-active' : ''}`}>
              <strong>Invoices</strong>
              <span>Open balances</span>
            </Link>
          </nav>

          <div className="admin-sidebar-footer">
            <div className="admin-account-copy">
              <strong>{session?.name}</strong>
              <span>{session?.role}</span>
            </div>
            <p className="admin-sidebar-powered">Powered by Aventus IT</p>
          </div>
        </aside>

        <div className="admin-main-shell">
          <header className="site-header admin-header">
            <details className="admin-mobile-nav">
              <summary className="secondary-button">Menu</summary>
              <nav className="admin-sidebar-nav" aria-label="Agent mobile">
                <Link href="/agent/dashboard" className={`admin-top-nav-link${pathname === '/agent/dashboard' ? ' admin-top-nav-link-active' : ''}`}>
                  <strong>Dashboard</strong>
                  <span>Business overview</span>
                </Link>
                <Link href="/agent/quotes" className={`admin-top-nav-link${pathname.startsWith('/agent/quotes') ? ' admin-top-nav-link-active' : ''}`}>
                  <strong>Quotes</strong>
                  <span>Active proposals</span>
                </Link>
                <Link href="/agent/bookings" className={`admin-top-nav-link${pathname.startsWith('/agent/bookings') ? ' admin-top-nav-link-active' : ''}`}>
                  <strong>Bookings</strong>
                  <span>Confirmed travel</span>
                </Link>
                <Link href="/agent/invoices" className={`admin-top-nav-link${pathname.startsWith('/agent/invoices') ? ' admin-top-nav-link-active' : ''}`}>
                  <strong>Invoices</strong>
                  <span>Open balances</span>
                </Link>
              </nav>
            </details>

            <div className="admin-topbar">
              <div className="admin-topbar-copy">
                <p className="eyebrow">Agent Portal</p>
                <h2 className="admin-subnav-title">Client-facing workspace</h2>
                <p className="admin-subnav-copy">A separate surface for agents and external proposal sharing.</p>
              </div>

              <div className="admin-account">
                <div className="admin-account-copy">
                  <strong>{session?.name}</strong>
                  <span>{session?.role}</span>
                </div>
                <form action="/api/auth/logout" method="POST">
                  <button type="submit" className="secondary-button">
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </header>

          <div className="admin-content-shell">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <div className="admin-brand-row">
            <img src="/axis-logo.png" alt="AXIS" className="admin-brand-logo" />
          </div>
          <p className="admin-sidebar-copy">Operational control, products, suppliers, and finance in one compact shell.</p>
        </div>

        <AdminChromeNav mode="primary" sessionRole={session?.role} />

        <div className="admin-sidebar-subnav">
          <AdminChromeNav mode="subnav" sessionRole={session?.role} />
        </div>

        <div className="admin-sidebar-footer">
          <div className="admin-account-copy">
            <strong>{session?.name}</strong>
            <span>{session?.role}</span>
          </div>
          <p className="admin-sidebar-powered">Powered by Aventus IT</p>
        </div>
      </aside>

      <div className="admin-main-shell">
        <header className="site-header admin-header">
          <details className="admin-mobile-nav">
            <summary className="secondary-button">Menu</summary>
            <AdminChromeNav mode="primary" sessionRole={session?.role} />
          </details>

          <div className="admin-topbar">
            {!isDashboardRoute ? <AdminChromeNav mode="topbar" sessionRole={session?.role} /> : null}

            <div className="admin-account">
              <div className="admin-account-copy">
                <strong>{session?.name}</strong>
                <span>{session?.role}</span>
              </div>
              <form action="/api/auth/logout" method="POST">
                <button type="submit" className="secondary-button">
                  Sign out
                </button>
              </form>
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
  );
}

