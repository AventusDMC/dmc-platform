import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../proxy-response';

// Hotel Contract Stabilization & Trustworthiness v2 — proxy for the
// /hotel-contract-health/* family of endpoints (dashboard, queue,
// validation, diff, confidence patch). Wildcard catch-all so the admin
// app doesn't need a route file per sub-path.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

function buildUpstreamUrl(path: string[], search: string) {
  const suffix = path.map(encodeURIComponent).join('/');
  return `${API_BASE_URL}/hotel-contract-health/${suffix}${search}`;
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const response = await fetch(buildUpstreamUrl(path, request.nextUrl.search), {
    headers: buildActorHeaders(request),
    cache: 'no-store',
    redirect: 'manual',
  });
  return forwardProxyJsonResponse(response);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const body = await request.json();
  const response = await fetch(buildUpstreamUrl(path, ''), {
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

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const body = await request.json();
  const response = await fetch(buildUpstreamUrl(path, ''), {
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
