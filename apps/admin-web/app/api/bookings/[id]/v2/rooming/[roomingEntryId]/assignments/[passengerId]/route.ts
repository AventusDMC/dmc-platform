import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../../../actorHeaders';
import { forwardProxyJsonResponse, proxyFetchErrorResponse } from '../../../../../../../proxy-response';

// PR-2c-2 — V2 JSON proxy for UNASSIGN passenger from room. Forwards to the
// existing backend DELETE /bookings/:id/rooming/:roomingEntryId/assignments/:passengerId
// and returns JSON (never a redirect). No body. The Classic proxy is untouched.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; roomingEntryId: string; passengerId: string }> },
) {
  const { id, roomingEntryId, passengerId } = await context.params;

  try {
    const response = await fetch(
      `${API_BASE_URL}/bookings/${id}/rooming/${roomingEntryId}/assignments/${passengerId}`,
      {
        method: 'DELETE',
        headers: buildActorHeaders(request),
        cache: 'no-store',
        redirect: 'manual',
      },
    );
    return forwardProxyJsonResponse(response);
  } catch (error) {
    return proxyFetchErrorResponse(error);
  }
}
