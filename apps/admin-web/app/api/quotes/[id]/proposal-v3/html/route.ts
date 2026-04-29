import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../bookings/actorHeaders';
import { forwardProxyContentResponse } from '../../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const token = request.cookies.get('dmc_session')?.value;
  const response = await fetch(`${API_BASE_URL}/quotes/${id}/proposal-v3.html${request.nextUrl.search}`, {
    method: 'GET',
    headers: {
      ...buildActorHeaders(request),
      ...(token ? { Cookie: `dmc_session=${token}` } : {}),
    },
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyContentResponse(response);
}
