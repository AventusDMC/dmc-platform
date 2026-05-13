import { NextRequest } from 'next/server';
import { proxyRequest } from '../../proxy-request';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

type TouringRouteProxyParams = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: TouringRouteProxyParams) {
  const { id } = await params;
  return proxyRequest(request, `${API_BASE_URL}/touring-routes/${encodeURIComponent(id)}${request.nextUrl.search}`, 'GET');
}

export async function PATCH(request: NextRequest, { params }: TouringRouteProxyParams) {
  const { id } = await params;
  return proxyRequest(request, `${API_BASE_URL}/touring-routes/${encodeURIComponent(id)}`, 'PATCH');
}
