import { NextRequest, NextResponse } from 'next/server';

export const SESSION_COOKIE_NAME = 'dmc_session';

/**
 * Determine whether the inbound request is served over HTTPS.
 *
 * Cookies flagged `Secure` are silently rejected by browsers over plain HTTP
 * (e.g. local dev on http://localhost). Mirroring the request protocol here is
 * what allows the session cookie to actually be written/cleared locally while
 * still being marked Secure in production (Vercel/Railway behind HTTPS).
 */
export function isSecureRequest(request: NextRequest) {
  if (request.nextUrl.protocol === 'https:') {
    return true;
  }

  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0]?.trim() === 'https';
  }

  return false;
}

/**
 * Clear the session cookie on a response using attributes that match how the
 * login route sets it (httpOnly, sameSite=lax, dynamic secure, path=/). The
 * matching attributes — and crucially the dynamic `secure` flag — are what make
 * the deletion actually take effect in local dev as well as production.
 */
export function clearSessionCookie(response: NextResponse, request: NextRequest) {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(request),
    path: '/',
    maxAge: 0,
  });

  return response;
}
