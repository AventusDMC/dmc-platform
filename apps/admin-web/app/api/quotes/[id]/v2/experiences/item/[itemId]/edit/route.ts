import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../../../../../proxy-response';

// Quote Builder V2 — E-b: guarded EDIT-apply for the External Package commercial edit.
// Forwards to the backend route POST /quotes/:id/v2/experiences/item/:itemId/edit, gated
// by QUOTE_EXTERNAL_PACKAGE_EDIT (fail-closed) + admin/finance. The backend verifies the
// opaque v2e previewToken (never a v2s/v2c token), fails closed on a stale snapshot,
// requires the selling-delta acknowledgement, then delegates to the deterministic
// updateItem with a SERVER-BUILT {netCost, pricingBasis} patch and writes a single
// quote.item.updated audit. Only the two approved edit fields + the preview/apply
// confirmation fields (previewToken, acknowledgedDelta) are forwarded — never arbitrary
// client properties, never a pricing-apply payload.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    netCost?: unknown;
    pricingBasis?: unknown;
    previewToken?: unknown;
    acknowledgedDelta?: unknown;
  };
  // Strict allowlist — forward ONLY the two approved edit fields + the confirmation
  // fields. No currency/markup/sell-override/packageName/description/supplier/notes/day
  // /date/identity fields are ever forwarded.
  const forwarded: Record<string, unknown> = {
    previewToken: body?.previewToken,
    acknowledgedDelta: body?.acknowledgedDelta === true,
  };
  if (body?.netCost !== undefined) forwarded.netCost = body.netCost;
  if (body?.pricingBasis !== undefined) forwarded.pricingBasis = body.pricingBasis;

  const response = await fetch(`${API_BASE_URL}/quotes/${id}/v2/experiences/item/${itemId}/edit`, {
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
