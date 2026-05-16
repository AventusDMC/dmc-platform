import { NextRequest } from 'next/server';
import { proxyRequest } from '../../proxy-request';
import { proxyFetchErrorResponse } from '../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return proxyRequest(request, `${API_BASE_URL}/restaurants/${id}`, 'PATCH');
  } catch (error) {
    return proxyFetchErrorResponse(error, 'Could not update restaurant.');
  }
}
