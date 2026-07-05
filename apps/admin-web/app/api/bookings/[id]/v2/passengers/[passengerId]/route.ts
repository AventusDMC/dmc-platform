import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../actorHeaders';
import { forwardProxyJsonResponse, proxyFetchErrorResponse } from '../../../../../proxy-response';
import { pickAllowedPassengerFields } from '../../../../../../operations/v2/ops-passenger-request';

// PR-2b — V2 JSON proxy for passenger UPDATE (PATCH) + DELETE. Forwards JSON to
// the existing backend endpoints and returns JSON (never a redirect). The
// Classic form-post/redirect proxy at ../../../passengers/[passengerId]/route.ts
// is untouched. Update forwards only the non-PII allowlisted fields.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; passengerId: string }> },
) {
  const { id, passengerId } = await context.params;
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const body = pickAllowedPassengerFields(raw);

  try {
    const response = await fetch(`${API_BASE_URL}/bookings/${id}/passengers/${passengerId}`, {
      method: 'PATCH',
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

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; passengerId: string }> },
) {
  const { id, passengerId } = await context.params;

  try {
    const response = await fetch(`${API_BASE_URL}/bookings/${id}/passengers/${passengerId}`, {
      method: 'DELETE',
      headers: buildActorHeaders(request),
      cache: 'no-store',
      redirect: 'manual',
    });
    return forwardProxyJsonResponse(response);
  } catch (error) {
    return proxyFetchErrorResponse(error);
  }
}
