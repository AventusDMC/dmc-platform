import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function forwardDayRequest(
  request: NextRequest,
  dayId: string,
  method: 'PATCH' | 'DELETE',
) {
  const body = method === 'PATCH' ? await request.json().catch(() => ({})) : undefined;
  const response = await fetch(`${API_BASE_URL}/itinerary/day/${dayId}`, {
    method,
    headers:
      method === 'PATCH'
        ? {
            'Content-Type': 'application/json',
            ...buildActorHeaders(request),
          }
        : buildActorHeaders(request),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ dayId: string }> },
) {
  const { dayId } = await context.params;
  return forwardDayRequest(request, dayId, 'PATCH');
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ dayId: string }> },
) {
  const { dayId } = await context.params;
  return forwardDayRequest(request, dayId, 'DELETE');
}
