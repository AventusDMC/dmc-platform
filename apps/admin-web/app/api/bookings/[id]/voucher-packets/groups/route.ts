import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../actorHeaders';
import { forwardProxyJsonResponse, proxyFetchErrorResponse } from '../../../../proxy-response';

// Supplier Voucher Packet V2 — S2 read-only proxy.
// GET only. Forwards to the backend READ endpoint that computes supplier packet
// groups and returns the JSON as-is (the backend DTO is finance/PII-free by
// construction). No mutation, no generate/PDF/send. Never a redirect.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const response = await fetch(`${API_BASE_URL}/bookings/${id}/voucher-packets/groups`, {
      method: 'GET',
      headers: { ...buildActorHeaders(request) },
      cache: 'no-store',
      redirect: 'manual',
    });
    return forwardProxyJsonResponse(response);
  } catch (error) {
    return proxyFetchErrorResponse(error);
  }
}
