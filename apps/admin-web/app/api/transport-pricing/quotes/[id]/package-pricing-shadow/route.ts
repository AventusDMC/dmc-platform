import { NextRequest } from 'next/server';
import { proxyRequest } from '../../../../proxy-request';

// PR10A — read-only proxy for the package pricing shadow-compare diagnostic.
// Forwards GET to the API (which is itself gated by transport.packagePricingShadowCompare).
// No writes; GET only.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyRequest(request, `${API_BASE_URL}/transport-pricing/quotes/${id}/package-pricing-shadow`, 'GET');
}
