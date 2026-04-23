import { NextRequest } from 'next/server';
import { forwardProxyJsonResponse } from '../../../../proxy-response';
import { buildActorHeaders } from '../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  const { id, paymentId } = await params;
  const body = await request.text();

  const response = await fetch(`${API_BASE_URL}/bookings/${id}/payments/${paymentId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body,
  });

  return forwardProxyJsonResponse(response);
}
