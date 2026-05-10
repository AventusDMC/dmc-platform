import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../bookings/actorHeaders';
import { forwardProxyJsonResponse, proxyFetchErrorResponse } from '../../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; roomingGroupId: string }> },
) {
  const { id, roomingGroupId } = await context.params;
  const body = await request.json().catch(() => ({}));
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/quotes/${encodeURIComponent(id)}/rooming/${encodeURIComponent(roomingGroupId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...buildActorHeaders(request),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch (error) {
    return proxyFetchErrorResponse(error, 'Could not reach API server while updating quote rooming group.');
  }

  return forwardProxyJsonResponse(response);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; roomingGroupId: string }> },
) {
  const { id, roomingGroupId } = await context.params;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/quotes/${encodeURIComponent(id)}/rooming/${encodeURIComponent(roomingGroupId)}`, {
      method: 'DELETE',
      headers: buildActorHeaders(request),
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch (error) {
    return proxyFetchErrorResponse(error, 'Could not reach API server while deleting quote rooming group.');
  }

  return forwardProxyJsonResponse(response);
}
