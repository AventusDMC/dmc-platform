import { NextRequest } from 'next/server';
import { forwardProxyJsonResponse } from '../proxy-response';
import { buildActorHeaders } from '../bookings/actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
  const response = await fetch(`${API_BASE_URL}/companies`, {
    headers: {
      ...buildActorHeaders(request),
    },
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
