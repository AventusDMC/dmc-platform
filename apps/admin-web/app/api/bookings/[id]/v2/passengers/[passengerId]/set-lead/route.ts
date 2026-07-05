import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../../actorHeaders';
import { forwardProxyJsonResponse, proxyFetchErrorResponse } from '../../../../../../proxy-response';

// PR-2b — V2 JSON proxy for SET-LEAD. Forwards to the existing backend
// POST /bookings/:id/passengers/:passengerId/set-lead and returns JSON. No body
// (the lead is chosen purely by id). The Classic proxy (which dispatches set-lead
// via an `intent` form field) is untouched.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; passengerId: string }> },
) {
  const { id, passengerId } = await context.params;

  try {
    const response = await fetch(`${API_BASE_URL}/bookings/${id}/passengers/${passengerId}/set-lead`, {
      method: 'POST',
      headers: buildActorHeaders(request),
      cache: 'no-store',
      redirect: 'manual',
    });
    return forwardProxyJsonResponse(response);
  } catch (error) {
    return proxyFetchErrorResponse(error);
  }
}
