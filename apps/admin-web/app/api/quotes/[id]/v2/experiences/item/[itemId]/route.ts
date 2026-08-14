import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../../../../proxy-response';

// Quote Builder V2 — D-b: guarded item DELETE. Forwards to the backend route
// DELETE /quotes/:id/v2/experiences/item/:itemId, gated by QUOTE_ITEM_CREATE
// (fail-closed) + admin/operations/finance. Only the previewToken (from remove-preview)
// is forwarded in the body — no pricing/cost/voucher/packet fields. The backend replays
// the token, fails closed on staleness, then delegates to the deterministic removeItem.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const response = await fetch(`${API_BASE_URL}/quotes/${id}/v2/experiences/item/${itemId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    // Forward ONLY the previewToken — never any cost/pricing/voucher fields.
    body: JSON.stringify({ previewToken: (body as { previewToken?: unknown })?.previewToken }),
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
