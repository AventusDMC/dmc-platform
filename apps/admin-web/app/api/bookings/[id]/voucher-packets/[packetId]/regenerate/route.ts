import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../actorHeaders';
import { forwardProxyJsonResponse, proxyFetchErrorResponse } from '../../../../../proxy-response';

// Supplier Voucher Packet V2 — S6 regenerate proxy.
// POST only, NO body. Forwards to the backend regenerate endpoint, which rebuilds
// the packet snapshot/items/contentHash in place (same packetId, status stays
// GENERATED) and re-enforces role + the fail-closed OPS_V2_VOUCHER_PACKET_ENABLED
// flag. JSON verbatim. No PDF, no preview, no supplier email. Never a redirect.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; packetId: string }> },
) {
  const { id, packetId } = await params;
  try {
    const response = await fetch(`${API_BASE_URL}/bookings/${id}/voucher-packets/${packetId}/regenerate`, {
      method: 'POST',
      headers: { ...buildActorHeaders(request) },
      cache: 'no-store',
      redirect: 'manual',
    });
    return forwardProxyJsonResponse(response);
  } catch (error) {
    return proxyFetchErrorResponse(error);
  }
}
