import { NextRequest } from 'next/server';
import { proxyRequest } from '../../../proxy-request';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function GET(request: NextRequest, context: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await context.params;
  return proxyRequest(request, `${API_BASE_URL}/vehicle-rates/cards/${encodeURIComponent(cardId)}`, 'GET');
}
