import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

function buildUpstreamUrl(id: string, path: string[], search: string) {
  const suffix = path.map(encodeURIComponent).join('/');
  return `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(id)}/${suffix}${search}`;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await context.params;
  const response = await fetch(buildUpstreamUrl(id, path, request.nextUrl.search), {
    headers: buildActorHeaders(request),
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await context.params;
  const body = await request.json();
  const response = await fetch(buildUpstreamUrl(id, path, ''), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify(body),
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await context.params;
  const body = await request.json();
  const response = await fetch(buildUpstreamUrl(id, path, ''), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify(body),
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await context.params;
  const response = await fetch(buildUpstreamUrl(id, path, ''), {
    method: 'DELETE',
    headers: buildActorHeaders(request),
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
