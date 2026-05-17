import { NextRequest } from 'next/server';
import { forwardProxyJsonResponse } from '../../../proxy-response';
import { buildActorHeaders } from '../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.text();

  const response = await fetch(`${API_BASE_URL}/bookings/${id}/operational-amendments`, {
    method: 'POST',
    headers: {
      ...buildActorHeaders(request),
      'content-type': request.headers.get('content-type') || 'application/json',
    },
    body,
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
