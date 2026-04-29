import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(request: NextRequest) {
  const headers = new Headers(buildActorHeaders(request));
  const contentType = request.headers.get('content-type');
  const contentLength = request.headers.get('content-length');

  if (contentType) {
    headers.set('content-type', contentType);
  }

  if (contentLength) {
    headers.set('content-length', contentLength);
  }

  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers,
    body: request.body,
    cache: 'no-store',
    redirect: 'manual',
    duplex: 'half',
  };

  const response = await fetch(`${API_BASE_URL}/contract-imports/analyze`, init);

  return forwardProxyJsonResponse(response);
}
