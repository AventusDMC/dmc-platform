import { NextRequest, NextResponse } from 'next/server';
import { buildActorHeaders } from '../../../../../bookings/actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// ---------------------------------------------------------------------------
// Operations V2 — Phase 2F-B: actual voucher SEND (Resend, backend-gated).
//
// POST only, EMPTY body. Forwards to the backend send endpoint, which is the sole
// authority: it re-runs 2F-A readiness, re-resolves the recipient from the assigned
// operational supplier, enforces the recipient allowlist + verified sender + the
// OPS_V2_VOUCHER_SEND_ENABLED kill-switch, attaches the finance-free PDF, and sends
// via Resend. This proxy accepts and forwards NO recipient/subject/body/attachment.
// No status change, no sentAt/issuedAt; audit is written server-side only on success.
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string; operationId: string }> },
) {
  const { bookingId, operationId } = await params;

  const response = await fetch(
    `${API_BASE_URL}/bookings/${bookingId}/operations/${operationId}/voucher/send`,
    {
      method: 'POST',
      headers: { ...buildActorHeaders(request), 'Content-Type': 'application/json' },
      // Empty body — the server resolves everything. Never forward client fields.
      body: '{}',
      cache: 'no-store',
    },
  );

  const data = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') {
    return NextResponse.json({ message: 'Voucher send is unavailable. Open in Classic.' }, { status: 502 });
  }

  return NextResponse.json(data, { status: response.ok ? 200 : response.status, headers: { 'cache-control': 'no-store' } });
}
