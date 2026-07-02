import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../../../proxy-response';

// Quote Builder V2 — Phase B, Slice 1: create an itinerary day (V2-scoped).
// Forwards to the NEW backend route POST /quotes/:id/v2/itinerary/day, which is
// gated by QUOTE_ITINERARY_EDIT (fail-closed) + admin/operations. The shared
// Classic itinerary endpoints are untouched.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const response = await fetch(`${API_BASE_URL}/quotes/${id}/v2/itinerary/day`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
