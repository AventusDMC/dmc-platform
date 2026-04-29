import { NextRequest } from 'next/server';
import { forwardProxyContentResponse } from '../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const response = await fetch(`${API_BASE_URL}/public/proposals/${token}${request.nextUrl.search}`, {
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyContentResponse(response);
}
