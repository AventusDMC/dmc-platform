import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email || '').trim();
  const password = String(body?.password || '').trim();

  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

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
  });

  result.cookies.set('dmc_session', payload.token, {
  httpOnly: true,
  sameSite: 'none',
  secure: true,
  path: '/',
  maxAge: 60 * 60 * 12,
});

  return result;
}
