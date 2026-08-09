import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// VV-3 Slice 2B: read-only proxy for the SAFE version summary. Forwards ONLY to the
// backend GET /quotes/:id/versions/:versionId/summary (Slice 2A, PR #803) — a
// whitelist-curated, role/cost-gated, PII-free payload. It never forwards to the raw
// GET /quotes/:id/versions/:versionId detail route (which returns snapshotJson).
// GET only; no write path.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; versionId: string }> },
) {
  const { id, versionId } = await context.params;
  const response = await fetch(
    `${API_BASE_URL}/quotes/${id}/versions/${versionId}/summary${request.nextUrl.search}`,
    {
      headers: buildActorHeaders(request),
      cache: 'no-store',
      redirect: 'manual',
    },
  );

  return forwardProxyJsonResponse(response);
}
