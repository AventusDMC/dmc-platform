import { NextRequest } from 'next/server';
import { proxyRequest } from '../../proxy-request';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function GET(request: NextRequest) {
  return proxyRequest(request, `${API_BASE_URL}/reports/supplier-payables${request.nextUrl.search}`, 'GET');
}
