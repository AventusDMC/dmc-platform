import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

type RouteContext = {
  params: Promise<{ quoteItemId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { quoteItemId } = await context.params;
  const response = await fetch(`${API_BASE_URL}/vouchers/quote-items/${quoteItemId}/preview`, {
    headers: buildActorHeaders(request),
    credentials: 'include',
    cache: 'no-store',
  });

  return forwardProxyJsonResponse(response);
}
