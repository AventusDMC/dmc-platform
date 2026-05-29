import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../proxy-response';

// Proxy for GET /promotions/evaluate (the quote simulator's promotions
// panel). Needs its own route file: the static `evaluate` segment takes
// precedence over the sibling `[id]` route, which only handles
// PATCH/DELETE — without this, GET /api/promotions/evaluate would fall
// through to [id] and 404.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function GET(request: NextRequest) {
  const response = await fetch(`${API_BASE_URL}/promotions/evaluate${request.nextUrl.search}`, {
    headers: buildActorHeaders(request),
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
