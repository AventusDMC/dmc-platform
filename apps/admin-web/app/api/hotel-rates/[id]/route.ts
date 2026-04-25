import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  const response = await fetch(`${API_BASE_URL}/hotel-rates/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify(body),
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const response = await fetch(`${API_BASE_URL}/hotel-rates/${id}`, {
    method: 'DELETE',
    headers: buildActorHeaders(request),
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
