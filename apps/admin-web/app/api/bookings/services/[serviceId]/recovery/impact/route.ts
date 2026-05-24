import { NextRequest } from 'next/server';
import { proxyRequest } from '../../../../../proxy-request';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  const { serviceId } = await params;
  return proxyRequest(request, `${API_BASE_URL}/bookings/services/${serviceId}/recovery/impact`, 'GET');
}
