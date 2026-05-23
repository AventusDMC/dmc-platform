import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '../session-cookie';

/**
 * Single endpoint that every "your session is no longer valid" path routes
 * through. It clears the (httpOnly) session cookie server-side and then sends
 * the browser to the login screen.
 *
 * This is what breaks the historical redirect loop: previously a rejected token
 * (frontend accepts it, backend returns 401) bounced endlessly between /login
 * and the dashboard because nothing ever removed the stale cookie. Clearing it
 * here means the next render sees no session and stays on /login.
 */
function getSafeNext(next: string | null) {
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return '/admin/dashboard';
  }

  const [pathname] = next.split('?');
  return pathname === '/login' || pathname === '/signup' || pathname === '/accept-invite' ? '/admin/dashboard' : next;
}

export async function GET(request: NextRequest) {
  const next = getSafeNext(request.nextUrl.searchParams.get('next'));
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('reason', 'session-expired');
  loginUrl.searchParams.set('next', next);

  const response = NextResponse.redirect(loginUrl, { status: 303 });
  return clearSessionCookie(response, request);
}
