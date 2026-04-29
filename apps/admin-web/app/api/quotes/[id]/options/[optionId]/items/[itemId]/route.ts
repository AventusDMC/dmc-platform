import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; optionId: string; itemId: string }> },
) {
  const { id, optionId, itemId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const response = await fetch(`${API_BASE_URL}/quotes/${id}/options/${optionId}/items/${itemId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; optionId: string; itemId: string }> },
) {
  const { id, optionId, itemId } = await context.params;
  const response = await fetch(`${API_BASE_URL}/quotes/${id}/options/${optionId}/items/${itemId}`, {
    method: 'DELETE',
    headers: buildActorHeaders(request),
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
