import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

function buildUpstreamUrl(request: NextRequest, path?: string[]) {
  const suffix = path?.length ? `/${path.map(encodeURIComponent).join('/')}` : '';
  return `${API_BASE_URL}/quote-engine${suffix}${request.nextUrl.search}`;
}

async function proxy(request: NextRequest, context: { params: Promise<{ path?: string[] }> }, method: string) {
  const { path } = await context.params;
  const headers = new Headers(buildActorHeaders(request));
  const contentType = request.headers.get('content-type');
  if (contentType) {
    headers.set('Content-Type', contentType);
  }

  const response = await fetch(buildUpstreamUrl(request, path), {
    method,
    headers,
    body: method === 'GET' ? undefined : await request.text(),
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}

export function GET(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, context, 'GET');
}

export function POST(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, context, 'POST');
}

export function PATCH(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, context, 'PATCH');
}

export function DELETE(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, context, 'DELETE');
}
