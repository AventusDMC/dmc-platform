import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../bookings/actorHeaders';
import { forwardProxyJsonResponse, proxyFetchErrorResponse } from '../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const response = await fetch(`${API_BASE_URL}/quotes/${id}/convert-to-booking`, {
      method: 'POST',
      headers: {
        ...buildActorHeaders(request),
        accept: 'application/json',
      },
      cache: 'no-store',
      redirect: 'manual',
    });

    return forwardProxyJsonResponse(response);
  } catch (error) {
    return proxyFetchErrorResponse(error, 'Could not reach quote conversion API.');
  }
}
