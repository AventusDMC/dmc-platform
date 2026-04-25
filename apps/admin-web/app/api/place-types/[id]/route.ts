import { NextRequest } from 'next/server';
import { proxyRequest } from '../../proxy-request';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyRequest(request, `${API_BASE_URL}/place-types/${encodeURIComponent(id)}${request.nextUrl.search}`, 'GET');
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyRequest(request, `${API_BASE_URL}/place-types/${encodeURIComponent(id)}`, 'PATCH');
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyRequest(request, `${API_BASE_URL}/place-types/${encodeURIComponent(id)}`, 'DELETE');
}
