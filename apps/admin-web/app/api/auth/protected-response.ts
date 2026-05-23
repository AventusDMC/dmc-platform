import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from './session-cookie';

const PERMISSION_DENIED_MESSAGE = 'You are signed in, but your account does not have permission to do that.';

type RedirectValues = {
  request: NextRequest;
  referer: string | null;
  fallbackPath: string;
  genericError: string;
};

export async function buildProtectedActionErrorRedirect(values: RedirectValues, response: Response) {
  const redirectUrl = new URL(values.referer || values.fallbackPath, values.request.url);

  if (response.status === 401) {
    const loginUrl = new URL('/login', values.request.url);
    loginUrl.searchParams.set('reason', 'session-expired');
    loginUrl.searchParams.set('next', `${redirectUrl.pathname}${redirectUrl.search}`);

    // Clear the stale cookie as part of the redirect so the login page does not
    // immediately bounce back to a protected route (the historical loop).
    const redirectResponse = NextResponse.redirect(loginUrl, { status: 303 });
    return clearSessionCookie(redirectResponse, values.request);
  }

  const payload = await response.json().catch(() => null);
  redirectUrl.searchParams.set(
    'warningText',
    String(payload?.message || payload?.error || (response.status === 403 ? PERMISSION_DENIED_MESSAGE : values.genericError)),
  );
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
