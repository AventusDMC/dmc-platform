import { NextRequest, NextResponse } from 'next/server';
import { buildActorHeaders } from '../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function GET(request: NextRequest) {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: buildActorHeaders(request),
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch {
    return NextResponse.json(
      {
        message: 'Authentication service is unavailable.',
      },
      { status: 502 },
    );
  }

  return forwardProxyJsonResponse(response);
}
