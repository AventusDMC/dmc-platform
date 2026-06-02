import { NextRequest } from 'next/server';
import { proxyRequest } from '../../../../proxy-request';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

type RouteContext = {
  params: Promise<{ id: string; componentId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id, componentId } = await context.params;
  return proxyRequest(
    request,
    `${API_BASE_URL}/package-templates/${encodeURIComponent(id)}/components/${encodeURIComponent(componentId)}`,
    'PATCH',
  );
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id, componentId } = await context.params;
  return proxyRequest(
    request,
    `${API_BASE_URL}/package-templates/${encodeURIComponent(id)}/components/${encodeURIComponent(componentId)}`,
    'DELETE',
  );
}
