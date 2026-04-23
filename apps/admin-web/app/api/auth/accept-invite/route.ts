import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/auth/accept-invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body || {}),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ message: 'Authentication service is unavailable.' }, { status: 502 });
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.token || !payload?.actor) {
    return NextResponse.json(
      { message: String(payload?.message || 'Could not accept invitation.') },
      { status: response.status || 400 },
    );
  }

  const result = NextResponse.json({
    actor: payload.actor,
  });
  const isSecure = request.nextUrl.protocol === 'https:' || process.env.NODE_ENV === 'production';

  result.cookies.set('dmc_session', payload.token, {
    httpOnly: true,
    sameSite: isSecure ? 'none' : 'lax',
    secure: isSecure,
    path: '/',
    maxAge: 60 * 60 * 12,
  });

  return result;
}
