import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../../../../proxy-response';

// Quote Builder V2 — Phase B, Slice 1: edit day meta (PATCH) / delete empty day
// (DELETE), V2-scoped. Forwards to the NEW backend routes
// PATCH|DELETE /quotes/:id/v2/itinerary/day/:dayId, gated by QUOTE_ITINERARY_EDIT
// (fail-closed) + admin/operations. Delete rejects non-empty days with a safe
// day_not_empty message. The shared Classic itinerary endpoints are untouched.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

async function forwardDayRequest(
  request: NextRequest,
  id: string,
  dayId: string,
  method: 'PATCH' | 'DELETE',
) {
  const body = method === 'PATCH' ? await request.json().catch(() => ({})) : undefined;
  const response = await fetch(`${API_BASE_URL}/quotes/${id}/v2/itinerary/day/${dayId}`, {
    method,
    headers:
      method === 'PATCH'
        ? {
            'Content-Type': 'application/json',
            ...buildActorHeaders(request),
          }
        : buildActorHeaders(request),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; dayId: string }> },
) {
  const { id, dayId } = await context.params;
  return forwardDayRequest(request, id, dayId, 'PATCH');
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; dayId: string }> },
) {
  const { id, dayId } = await context.params;
  return forwardDayRequest(request, id, dayId, 'DELETE');
}
