import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// Phase R.6A-0 — tailor-made draft hotel-stay configure / price-preview proxy
// (READ-ONLY; no QuoteItem, no pricing write, no quote-total change). Returns
// room/meal/occupancy options + an estimated cost/sell at the standard markup.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const response = await fetch(`${API_BASE_URL}/quotes/${id}/tailor-made-draft/hotel-stay-options`, {
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
