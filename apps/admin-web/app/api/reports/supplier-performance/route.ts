import { NextRequest } from 'next/server';
import { proxyRequest } from '../../proxy-request';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function GET(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.searchParams);
  const from = params.get('from');
  const to = params.get('to');

  if (from && !params.has('startDate')) {
    params.set('startDate', from);
  }
  if (to && !params.has('endDate')) {
    params.set('endDate', to);
  }
  params.delete('from');
  params.delete('to');

  const query = params.toString();
  return proxyRequest(request, `${API_BASE_URL}/reports/supplier-performance${query ? `?${query}` : ''}`, 'GET');
}
