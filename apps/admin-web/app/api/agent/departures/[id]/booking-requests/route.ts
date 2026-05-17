import { NextRequest } from 'next/server';
import { forwardProxyJsonResponse } from '../../../../proxy-response';
import { buildActorHeaders } from '../../../../bookings/actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const contentType = request.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await request.json().catch(() => ({}))
    : Object.fromEntries((await request.formData()).entries());
  const response = await fetch(`${API_BASE_URL}/agent/departures/${id}/booking-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify(body),
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
