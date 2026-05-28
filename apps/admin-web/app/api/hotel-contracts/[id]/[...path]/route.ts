import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../bookings/actorHeaders';
import { forwardProxyContentResponse, forwardProxyJsonResponse } from '../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// File-download subroutes (export.xlsx today; export.csv / export.pdf
// in future) carry their payload in the response body as a binary stream
// with a content-disposition attachment header. Detect them by extension
// so the proxy preserves the bytes + headers instead of forcing the
// response through the JSON helper, which would mangle the buffer and
// drop the filename hint.
const BINARY_PATH_SUFFIXES = ['.xlsx', '.xls', '.csv', '.pdf'];

function buildUpstreamUrl(id: string, path: string[], search: string) {
  const suffix = path.map(encodeURIComponent).join('/');
  return `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(id)}/${suffix}${search}`;
}

function isBinaryDownloadPath(path: string[]) {
  const last = path[path.length - 1] || '';
  return BINARY_PATH_SUFFIXES.some((suffix) => last.toLowerCase().endsWith(suffix));
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await context.params;
  const response = await fetch(buildUpstreamUrl(id, path, request.nextUrl.search), {
    headers: buildActorHeaders(request),
    cache: 'no-store',
    redirect: 'manual',
  });

  if (isBinaryDownloadPath(path)) {
    return forwardProxyContentResponse(response);
  }
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

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await context.params;
  const body = await request.json();
  const response = await fetch(buildUpstreamUrl(id, path, ''), {
    method: 'PUT',
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
