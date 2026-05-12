import { NextRequest } from 'next/server';
import { proxyRequest } from '../../../../proxy-request';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

type RouteContext = {
  params: Promise<{ id: string; dayId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id, dayId } = await context.params;
  return proxyRequest(request, `${API_BASE_URL}/package-templates/${encodeURIComponent(id)}/days/${encodeURIComponent(dayId)}`, 'PATCH');
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id, dayId } = await context.params;
  return proxyRequest(request, `${API_BASE_URL}/package-templates/${encodeURIComponent(id)}/days/${encodeURIComponent(dayId)}`, 'DELETE');
}
