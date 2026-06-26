import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// Read-only proxy for the V2 pricing-apply audit history of a quote. GET only.
// The backend (@Roles admin/operations, quote-scoped) returns sanitized
// `quote.pricing.apply` entries — no tokens/secrets/raw metadata.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const response = await fetch(`${API_BASE_URL}/quotes/${id}/pricing-apply-audit`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
