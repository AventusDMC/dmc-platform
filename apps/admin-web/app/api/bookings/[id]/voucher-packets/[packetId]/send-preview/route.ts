import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../actorHeaders';
import { forwardProxyJsonResponse, proxyFetchErrorResponse } from '../../../../../proxy-response';

// Supplier Voucher Packet V2 — S7 read-only send-preview proxy.
// GET only. Forwards to the backend readiness endpoint (which resolves the
// recipient from the packet's assigned supplier and re-enforces role + the
// fail-closed OPS_V2_VOUCHER_PACKET_ENABLED flag) and returns the JSON as-is.
// No body, no mutation, no email, no send. Never a redirect.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; packetId: string }> },
) {
  const { id, packetId } = await params;
  try {
    const response = await fetch(`${API_BASE_URL}/bookings/${id}/voucher-packets/${packetId}/send-preview`, {
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
