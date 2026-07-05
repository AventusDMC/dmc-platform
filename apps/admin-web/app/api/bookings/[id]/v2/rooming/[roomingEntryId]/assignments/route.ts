import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../../actorHeaders';
import { forwardProxyJsonResponse, proxyFetchErrorResponse } from '../../../../../../proxy-response';

// PR-2c-2 — V2 JSON proxy for ASSIGN passenger → room. Forwards JSON to the
// existing backend POST /bookings/:id/rooming/:roomingEntryId/assignments and
// returns JSON (never a redirect). The Classic form-post/redirect proxy at
// ../../../../rooming/[roomingEntryId]/assignments/route.ts is untouched. Only
// the passengerId is forwarded.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; roomingEntryId: string }> },
) {
  const { id, roomingEntryId } = await context.params;
  const raw = (await request.json().catch(() => ({}))) as { passengerId?: unknown };
  const passengerId = raw.passengerId ? String(raw.passengerId) : '';

  try {
    const response = await fetch(`${API_BASE_URL}/bookings/${id}/rooming/${roomingEntryId}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...buildActorHeaders(request) },
      body: JSON.stringify({ passengerId }),
      cache: 'no-store',
      redirect: 'manual',
    });
    return forwardProxyJsonResponse(response);
  } catch (error) {
    return proxyFetchErrorResponse(error);
  }
}
