import { NextRequest } from 'next/server';
import { proxyRequest } from '../../proxy-request';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyRequest(request, `${API_BASE_URL}/services/rates/${encodeURIComponent(id)}`, 'PATCH');
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyRequest(request, `${API_BASE_URL}/services/rates/${encodeURIComponent(id)}`, 'DELETE');
}
