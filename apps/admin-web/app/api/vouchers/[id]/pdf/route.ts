import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../bookings/actorHeaders';
import { forwardProxyContentResponse } from '../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const response = await fetch(`${API_BASE_URL}/vouchers/${id}/pdf`, {
    headers: buildActorHeaders(request),
    credentials: 'include',
    cache: 'no-store',
  });

  return forwardProxyContentResponse(response);
}
