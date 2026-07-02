import { NextRequest, NextResponse } from 'next/server';
import { buildActorHeaders } from '../../../../../bookings/actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// ---------------------------------------------------------------------------
// Operations V2 — Phase 2F-A: read-only voucher SEND PREVIEW / readiness (JSON).
//
// GET only. Calls the backend read-only send-preview endpoint and returns the
// safe readiness DTO verbatim. The backend describes what a voucher email WOULD
// contain (recipient resolved server-side from the assigned operational supplier)
// and is finance-free by construction. This proxy sends nothing, mutates nothing,
// streams no PDF, and accepts NO recipient/subject/body from the client.
// ---------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string; operationId: string }> },
) {
  const { bookingId, operationId } = await params;

  const response = await fetch(
    `${API_BASE_URL}/bookings/${bookingId}/operations/${operationId}/voucher/send-preview`,
    {
      method: 'GET',
      headers: { ...buildActorHeaders(request) },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { message: 'Send preview is unavailable. Open in Classic.' },
      { status: response.status === 404 ? 404 : 502 },
    );
  }

  const data = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') {
    return NextResponse.json({ message: 'Send preview is unavailable. Open in Classic.' }, { status: 502 });
  }

  return NextResponse.json(data, { status: 200, headers: { 'cache-control': 'no-store' } });
}
