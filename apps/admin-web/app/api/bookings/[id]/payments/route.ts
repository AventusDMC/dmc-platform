import { NextRequest } from 'next/server';
import { forwardProxyJsonResponse } from '../../../proxy-response';
import { buildActorHeaders } from '../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const response = await fetch(`${API_BASE_URL}/bookings/${id}/payments`, {
    headers: {
      ...buildActorHeaders(request),
    },
    cache: 'no-store',
  });

  return forwardProxyJsonResponse(response);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.text();

  const response = await fetch(`${API_BASE_URL}/bookings/${id}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body,
  });

  return forwardProxyJsonResponse(response);
}
