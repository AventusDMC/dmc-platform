import { NextRequest } from 'next/server';
import { proxyRequest } from '../../../../../proxy-request';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

type RouteContext = {
  params: Promise<{ id: string; templateId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id, templateId } = await context.params;
  return proxyRequest(
    request,
    `${API_BASE_URL}/quotes/${encodeURIComponent(id)}/package-templates/${encodeURIComponent(templateId)}/preview`,
    'GET',
  );
}
