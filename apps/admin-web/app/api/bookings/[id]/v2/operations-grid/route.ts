import { NextRequest } from 'next/server';
import { forwardProxyJsonResponse, proxyFetchErrorResponse } from '../../../../proxy-response';
import { buildActorHeaders } from '../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// Ops-DG-2: V2-ONLY proxy for the redacted operations grid. Forwards ONLY to the backend
// V2 route GET /bookings/:id/v2/operations-grid (allowlist-projected rows — no driver/
// vehicle/notes/contact/PII). The Classic proxy (../operations-grid) is unchanged and still
// serves the full shape Classic dispatch needs. GET only; no write path.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const response = await fetch(`${API_BASE_URL}/bookings/${id}/v2/operations-grid`, {
      headers: {
        ...buildActorHeaders(request),
      },
      cache: 'no-store',
      redirect: 'manual',
    });

    return forwardProxyJsonResponse(response);
  } catch (error) {
    return proxyFetchErrorResponse(error);
  }
}
