import { NextRequest, NextResponse } from 'next/server';
import { buildActorHeaders } from '../../../../bookings/actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
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

export async function POST(request: NextRequest, context: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await context.params;
  const formData = await request.formData();
  const response = await fetch(`${API_BASE_URL}/companies/${companyId}/branding/logo`, {
    method: 'POST',
    headers: buildActorHeaders(request),
    body: formData,
  });

  return forwardJsonResponse(response);
}
