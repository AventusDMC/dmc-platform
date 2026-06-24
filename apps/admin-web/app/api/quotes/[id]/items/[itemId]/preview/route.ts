import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// Proxy for the read-only dry-run pricing PREVIEW of an existing-item edit.
// The backend endpoint is feature-flagged (QUOTE_PRICING_PREVIEW, default OFF),
// persists nothing, and never recalculates the live quote. Body is forwarded
// verbatim; the backend enforces role/status/scope and returns a structured
// preview (or a blocked/feature_disabled response).
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const response = await fetch(`${API_BASE_URL}/quotes/${id}/items/${itemId}/preview`, {
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
