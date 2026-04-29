import { NextRequest } from 'next/server';
import { forwardProxyJsonResponse } from '../../../../proxy-response';
import { buildActorHeaders } from '../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(request: NextRequest) {
  const body = await request.text();

  const response = await fetch(`${API_BASE_URL}/bookings/reconciliation/payment-proofs/remind`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body,
  });

  return forwardProxyJsonResponse(response);
}
