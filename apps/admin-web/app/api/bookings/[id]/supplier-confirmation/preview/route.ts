import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../actorHeaders';
import { forwardProxyJsonResponse } from '../../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// Phase O.2B-1 — read-only supplier-confirmation PREVIEW proxy. GET only; forwards
// the optional ?supplierId / ?serviceId query. No send, no mutation.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const response = await fetch(
    `${API_BASE_URL}/bookings/${id}/supplier-confirmation/preview${request.nextUrl.search}`,
    {
      headers: buildActorHeaders(request),
      cache: 'no-store',
      redirect: 'manual',
    },
  );

  return forwardProxyJsonResponse(response);
}
