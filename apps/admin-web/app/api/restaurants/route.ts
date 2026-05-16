import { NextRequest } from 'next/server';
import { proxyRequest } from '../proxy-request';
import { proxyFetchErrorResponse } from '../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function GET(request: NextRequest) {
  try {
    return proxyRequest(request, `${API_BASE_URL}/restaurants`, 'GET');
  } catch (error) {
    return proxyFetchErrorResponse(error, 'Could not load restaurants.');
  }
}

export async function POST(request: NextRequest) {
  try {
    return proxyRequest(request, `${API_BASE_URL}/restaurants`, 'POST');
  } catch (error) {
    return proxyFetchErrorResponse(error, 'Could not create restaurant.');
  }
}
