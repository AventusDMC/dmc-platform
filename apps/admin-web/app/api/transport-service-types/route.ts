import { NextRequest } from 'next/server';
import { proxyRequest } from '../proxy-request';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
  return proxyRequest(request, `${API_BASE_URL}/transport-service-types${request.nextUrl.search}`, 'GET');
}
