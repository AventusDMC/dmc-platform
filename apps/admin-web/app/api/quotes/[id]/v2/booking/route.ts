import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../../proxy-response';

// Booking Creation V2 — Slice 1D: convert an accepted/confirmed quote into a booking.
// Forwards to the NEW backend route POST /quotes/:id/v2/booking, gated server-side by
// QUOTE_BOOKING_CREATE (fail-closed) + admin/operations. The shared Classic
// convert-to-booking endpoint (POST /quotes/:id/convert-to-booking) is untouched.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const response = await fetch(`${API_BASE_URL}/quotes/${id}/v2/booking`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: '{}',
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
