import { NextRequest, NextResponse } from 'next/server';
import { buildActorHeaders } from '../../../bookings/actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function buildBackendUrl(companyId: string) {
  return `${API_BASE_URL}/companies/${companyId}/branding`;
}

async function forwardJsonResponse(response: Response) {
  const body = await response.text();

  return new NextResponse(body, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') || 'application/json',
    },
  });
}

export async function GET(_request: NextRequest, context: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await context.params;
  const response = await fetch(buildBackendUrl(companyId), {
    headers: buildActorHeaders(_request),
    cache: 'no-store',
  });

  return forwardJsonResponse(response);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await context.params;
  const body = await request.text();
  const response = await fetch(buildBackendUrl(companyId), {
    method: 'PATCH',
    headers: {
      'Content-Type': request.headers.get('content-type') || 'application/json',
      ...buildActorHeaders(request),
    },
    body,
  });

  return forwardJsonResponse(response);
}
