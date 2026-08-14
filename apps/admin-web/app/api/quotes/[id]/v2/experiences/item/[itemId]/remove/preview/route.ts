import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../../../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../../../../../../proxy-response';

// Quote Builder V2 — D-b: read-only REMOVE-preview for the guarded item-delete flow.
// Forwards to the backend route POST /quotes/:id/v2/experiences/item/:itemId/remove/preview,
// gated by QUOTE_ITEM_CREATE (fail-closed) + admin/operations/finance. The backend performs
// NO writes and returns the projected post-remove selling totals + a signed v2-item-delete
// previewToken the DELETE replays. No pricing/cost body is sent (path params + actor only).
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await context.params;
  const response = await fetch(`${API_BASE_URL}/quotes/${id}/v2/experiences/item/${itemId}/remove/preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
