import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../bookings/actorHeaders';
import { forwardProxyContentResponse } from '../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
  const response = await fetch(`${API_BASE_URL}/exports/payments.csv${request.nextUrl.search}`, {
    headers: buildActorHeaders(request),
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyContentResponse(response);
}
