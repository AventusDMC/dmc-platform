import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../../../proxy-response';

// Quote Builder V2 — Phase B, Slice 2: add ONE Activity item (V2-scoped). Forwards
// to the NEW backend route POST /quotes/:id/v2/experiences/item, gated by
// QUOTE_ITEM_CREATE (fail-closed) + admin/operations. The shared Classic item-create
// endpoint (POST /quotes/:id/items) is untouched.
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
  const response = await fetch(`${API_BASE_URL}/quotes/${id}/v2/experiences/item`, {
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
