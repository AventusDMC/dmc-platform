import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../bookings/actorHeaders';
import { forwardProxyContentResponse } from '../../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const upstreamUrl = `${API_BASE_URL}/quotes/${id}/proposal-v3.html${request.nextUrl.search}`;
  console.info('[proposal-v3] proxy:html-request', {
    quoteId: id,
    path: `/api/quotes/${id}/proposal-v3/html`,
    upstreamUrl,
  });

  const response = await fetch(upstreamUrl, {
    headers: buildActorHeaders(request),
    cache: 'no-store',
    redirect: 'manual',
  });

  if (!response.ok) {
    const errorPreview = await response.clone().text().catch(() => '');
    console.error('[proposal-v3] proxy:html-error', {
      quoteId: id,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      bodyPreview: errorPreview.slice(0, 500),
    });
  }

  return forwardProxyContentResponse(response);
}
