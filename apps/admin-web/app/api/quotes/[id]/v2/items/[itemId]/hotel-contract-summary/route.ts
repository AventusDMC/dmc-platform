import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// HC-2: read-only proxy for the SAFE hotel contract/rate summary. Forwards ONLY to
// the backend GET /quotes/:id/v2/items/:itemId/hotel-contract-summary (HC-1/HC-1A) —
// a whitelist-curated, role/cost-gated, PII-free payload. It never forwards to any
// raw hotel/contract/rate endpoint. GET only; no write path.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await context.params;
  const response = await fetch(
    `${API_BASE_URL}/quotes/${id}/v2/items/${itemId}/hotel-contract-summary${request.nextUrl.search}`,
    {
      headers: buildActorHeaders(request),
      cache: 'no-store',
      redirect: 'manual',
    },
  );

  return forwardProxyJsonResponse(response);
}
