import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// VV-2 Slice B: read-only proxy for the version-readiness advisory. Forwards to the
// backend GET /quotes/:id/version-readiness (PR #795), which is role-gated
// (admin/viewer/finance) and returns only booleans/version numbers/reasons — no
// snapshotJson, no cost/margin. GET only; there is no write path here.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const response = await fetch(`${API_BASE_URL}/quotes/${id}/version-readiness${request.nextUrl.search}`, {
    headers: buildActorHeaders(request),
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
