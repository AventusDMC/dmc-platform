import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// Proxy for the meal-only pricing APPLY guard. The backend validates the
// preview token, re-runs the dry-run, and only then delegates to updateItem.
// It is dual-flag-gated (QUOTE_PRICING_PREVIEW + QUOTE_PRICING_APPLY, both
// default OFF) and role/status/meal guarded. Body is forwarded verbatim
// (edit payload + previewToken + acknowledgedDelta).
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const response = await fetch(`${API_BASE_URL}/quotes/${id}/items/${itemId}/apply-preview`, {
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
