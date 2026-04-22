import { NextRequest, NextResponse } from 'next/server';
import { buildActorHeaders } from '../../../bookings/actorHeaders';
import { forwardProxyContentResponse } from '../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const upstreamUrl = `${API_BASE_URL}/quotes/${id}/proposal-v3.pdf${request.nextUrl.search}`;
  console.info('[proposal-v3] proxy:pdf-request', {
    quoteId: id,
    path: `/api/quotes/${id}/pdf`,
    upstreamUrl,
  });

  const response = await fetch(upstreamUrl, {
    headers: buildActorHeaders(request),
    cache: 'no-store',
    redirect: 'manual',
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    const contentType = response.headers.get('content-type') || 'text/plain; charset=utf-8';
    console.error('[proposal-v3] proxy:pdf-error', {
      quoteId: id,
      status: response.status,
      contentType,
      bodyPreview: bodyText.slice(0, 500),
    });

    return new NextResponse(bodyText, {
      status: response.status,
      headers: {
        'content-type': contentType,
      },
    });
  }

  return forwardProxyContentResponse(response);
}
