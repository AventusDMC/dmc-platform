import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../../../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../../../../../../proxy-response';

// Quote Builder V2 — E-b: read-only EDIT-preview for the guarded External Package
// commercial edit. Forwards to the backend route
// POST /quotes/:id/v2/experiences/item/:itemId/edit/preview, gated by
// QUOTE_EXTERNAL_PACKAGE_EDIT (fail-closed) + admin/finance. The backend performs NO
// writes and returns the projected item/quote totals + a signed v2e previewToken the
// apply replays. Only the two backend-approved edit fields (netCost, pricingBasis) are
// forwarded — never arbitrary client properties, never the immutable/descriptive fields.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { netCost?: unknown; pricingBasis?: unknown };
  // Strict allowlist — forward ONLY netCost + pricingBasis. Every other property
  // (currency, markup, sell/override, packageName, description, previewToken, …) is
  // dropped here and never reaches the backend from the preview call.
  const forwarded: Record<string, unknown> = {};
  if (body?.netCost !== undefined) forwarded.netCost = body.netCost;
  if (body?.pricingBasis !== undefined) forwarded.pricingBasis = body.pricingBasis;

  const response = await fetch(`${API_BASE_URL}/quotes/${id}/v2/experiences/item/${itemId}/edit/preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify(forwarded),
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
