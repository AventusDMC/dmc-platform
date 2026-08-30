import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../../proxy-response';

// CP-N3b2b: same-origin GET-only proxy for the name-only operational passenger
// companion. Server-trusted auth via buildActorHeaders; backend enforces the
// internal-role allowlist. No mutation verbs. Never logs response bodies, PII, or
// credentials.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const response = await fetch(`${API_BASE_URL}/quotes/${encodeURIComponent(id)}/operational/passengers${request.nextUrl.search}`, {
    headers: buildActorHeaders(request),
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
