import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../actorHeaders';
import { forwardProxyJsonResponse, proxyFetchErrorResponse } from '../../../../proxy-response';
import { pickAllowedPassengerFields } from '../../../../../operations/v2/ops-passenger-request';

// PR-2b — V2 JSON proxy for passenger CREATE. Forwards JSON to the existing
// backend POST /bookings/:id/passengers and returns JSON (never a redirect).
// The Classic form-post/redirect proxy at ../../passengers/route.ts is untouched.
// Only the non-PII allowlisted fields are forwarded (defense in depth).
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const body = pickAllowedPassengerFields(raw);

  try {
    const response = await fetch(`${API_BASE_URL}/bookings/${id}/passengers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...buildActorHeaders(request) },
      body: JSON.stringify(body),
      cache: 'no-store',
      redirect: 'manual',
    });
    return forwardProxyJsonResponse(response);
  } catch (error) {
    return proxyFetchErrorResponse(error);
  }
}
