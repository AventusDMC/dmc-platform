import { NextRequest } from 'next/server';
import { proxyRequest } from '../proxy-request';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

function getApiBaseUrl() {
  if (!API_BASE_URL) {
    throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
  }

  return API_BASE_URL;
}

function activitiesApiError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Activities API request failed.';
  console.error('[api/activities] failed to proxy request', error);

  return Response.json({ message }, { status: 502 });
}

export async function GET(request: NextRequest) {
  try {
    return await proxyRequest(request, `${getApiBaseUrl()}/activities${request.nextUrl.search}`, 'GET');
  } catch (error) {
    return activitiesApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    return await proxyRequest(request, `${getApiBaseUrl()}/activities`, 'POST');
  } catch (error) {
    return activitiesApiError(error);
  }
}
