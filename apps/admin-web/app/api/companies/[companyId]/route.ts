import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type CompanyRouteContext = {
  params: Promise<{
    companyId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: CompanyRouteContext) {
  const { companyId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const response = await fetch(`${API_BASE_URL}/companies/${companyId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}

export async function PUT(request: NextRequest, context: CompanyRouteContext) {
  const { companyId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const response = await fetch(`${API_BASE_URL}/companies/${companyId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}

export async function DELETE(request: NextRequest, context: CompanyRouteContext) {
  const { companyId } = await context.params;
  const response = await fetch(`${API_BASE_URL}/companies/${companyId}`, {
    method: 'DELETE',
    headers: {
      ...buildActorHeaders(request),
    },
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
