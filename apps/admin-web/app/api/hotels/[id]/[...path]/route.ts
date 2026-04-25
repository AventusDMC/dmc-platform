import { NextRequest } from 'next/server';
import { proxyRequest } from '../../../proxy-request';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function buildUpstreamUrl(id: string, path: string[], search = '') {
  const suffix = path.map(encodeURIComponent).join('/');
  return `${API_BASE_URL}/hotels/${encodeURIComponent(id)}/${suffix}${search}`;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await context.params;
  return proxyRequest(request, buildUpstreamUrl(id, path, request.nextUrl.search), 'GET');
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await context.params;
  return proxyRequest(request, buildUpstreamUrl(id, path), 'POST');
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await context.params;
  return proxyRequest(request, buildUpstreamUrl(id, path), 'PATCH');
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await context.params;
  return proxyRequest(request, buildUpstreamUrl(id, path), 'DELETE');
}
