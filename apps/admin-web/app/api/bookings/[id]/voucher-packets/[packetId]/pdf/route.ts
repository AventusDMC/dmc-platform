import { NextRequest, NextResponse } from 'next/server';
import { buildActorHeaders } from '../../../../actorHeaders';

// Supplier Voucher Packet V2 — S5 read-only PDF download proxy.
// GET only. Streams the backend packet PDF (binary passthrough) — NOT JSON — so
// the browser downloads the file. Forwards the session; the backend re-enforces
// role + the fail-closed OPS_V2_VOUCHER_PACKET_ENABLED flag. No mutation, no
// redirect, no status/audit — pure read.
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
    const response = await fetch(`${API_BASE_URL}/bookings/${id}/voucher-packets/${packetId}/pdf`, {
      method: 'GET',
      headers: { ...buildActorHeaders(request) },
      cache: 'no-store',
      redirect: 'manual',
    });

    if (!response.ok) {
      const status = response.status === 404 ? 404 : response.status === 403 ? 403 : 502;
      return NextResponse.json({ message: 'Voucher packet PDF is unavailable.' }, { status });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const headers = new Headers();
    headers.set('content-type', response.headers.get('content-type') || 'application/pdf');
    const disposition = response.headers.get('content-disposition');
    if (disposition) headers.set('content-disposition', disposition);
    return new NextResponse(buffer, { status: 200, headers });
  } catch {
    return NextResponse.json({ message: 'Could not reach API server.' }, { status: 502 });
  }
}
