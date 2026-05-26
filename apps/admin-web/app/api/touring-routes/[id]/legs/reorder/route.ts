import { NextRequest } from 'next/server';
import { proxyRequest } from '../../../../proxy-request';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  return proxyRequest(request, `${API_BASE_URL}/touring-routes/${id}/legs/reorder`, 'POST');
}
