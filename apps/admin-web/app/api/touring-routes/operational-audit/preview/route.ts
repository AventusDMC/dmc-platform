import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../bookings/actorHeaders';
import { forwardProxyJsonResponse, proxyFetchErrorResponse } from '../../../proxy-response';

const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('API_URL or NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${API_BASE_URL}/touring-routes/operational-audit/preview`, {
      method: 'GET',
      headers: buildActorHeaders(request),
      cache: 'no-store',
      redirect: 'manual',
    });

    return forwardProxyJsonResponse(response);
  } catch (error) {
    return proxyFetchErrorResponse(error, 'Could not reach API server while loading touring route operational audit.');
  }
}
