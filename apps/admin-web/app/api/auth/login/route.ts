import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
const AUTH_LOGIN_TIMEOUT_MS = 15000;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

function getSafeNextPath(nextPath?: string) {
  if (!nextPath?.startsWith('/') || nextPath.startsWith('//')) {
    return '/admin/dashboard';
  }

  const [pathname] = nextPath.split('?');

  return pathname === '/login' || pathname === '/signup' || pathname === '/accept-invite' ? '/admin/dashboard' : nextPath;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

type LoginPayload = {
  token?: string;
  actor?: {
    id?: string;
    role?: string;
  };
  message?: string;
};

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => null);
  const email = String(body?.email || '').trim();
  const password = String(body?.password || '').trim();
  const nextPath = getSafeNextPath(typeof body?.next === 'string' ? body.next : undefined);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_LOGIN_TIMEOUT_MS);

  let response: Response;
  let payload: LoginPayload | null = null;

  try {
    console.log(`[auth/login] login start email=${email || 'missing'} upstream=${API_BASE_URL}/auth/login`);
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
      signal: controller.signal,
    });
    console.log(`[auth/login] upstream response complete email=${email || 'missing'} status=${response.status} elapsedMs=${Date.now() - startedAt}`);
    payload = await response.json().catch(() => null);
  } catch (error) {
    const timedOut = isAbortError(error);
    console.error(
      `[auth/login] upstream request failed email=${email || 'missing'} timeout=${timedOut ? 'yes' : 'no'} elapsedMs=${
        Date.now() - startedAt
      } message=${error instanceof Error ? error.message : String(error)}`,
    );
    return NextResponse.json(
      {
        message: timedOut ? 'Authentication service timed out.' : 'Authentication service is unavailable.',
      },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok || !payload?.token || !payload?.actor) {
    console.log(`[auth/login] response sent email=${email || 'missing'} status=${response.status} elapsedMs=${Date.now() - startedAt}`);
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
  const isSecure = request.nextUrl.protocol === 'https:';

  result.cookies.set('dmc_session', payload.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure,
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  console.log(`[auth/login] session create complete email=${email || 'missing'} elapsedMs=${Date.now() - startedAt}`);
  console.log(`[auth/login] response sent email=${email || 'missing'} status=200 elapsedMs=${Date.now() - startedAt}`);

  return result;
}
