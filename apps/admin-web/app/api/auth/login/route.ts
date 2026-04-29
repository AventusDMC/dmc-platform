import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

function getSafeNextPath(nextPath?: string) {
  return nextPath?.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/admin/dashboard';
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email || '').trim();
  const password = String(body?.password || '').trim();
  const nextPath = getSafeNextPath(typeof body?.next === 'string' ? body.next : undefined);

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      {
        message: 'Authentication service is unavailable.',
      },
      { status: 502 },
    );
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.token || !payload?.actor) {
    return NextResponse.json(
      {
        message: String(payload?.message || 'Invalid email or password.'),
      },
      { status: response.status || 401 },
    );
  }

  const result = NextResponse.json({
    actor: payload.actor,
    next: nextPath,
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
