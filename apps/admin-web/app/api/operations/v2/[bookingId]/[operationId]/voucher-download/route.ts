import { NextRequest, NextResponse } from 'next/server';
import { buildActorHeaders } from '../../../../../bookings/actorHeaders';
import { forwardProxyContentResponse } from '../../../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// ---------------------------------------------------------------------------
// Operations V2 — Phase 2E: read-only voucher PDF DOWNLOAD (streamed).
//
// GET only. Two safe reads, no mutation:
//   1. resolve the operation's voucher id (GET .../operations/:operationId/voucher)
//   2. stream the SAFE operational voucher PDF (GET /vouchers/:voucherId/pdf →
//      generateServiceVoucherPdf: pure render, no status change / sentAt /
//      audit / email, and the PDF renders NO cost/finance data).
// The voucher id is resolved server-side and never exposed to the browser. No
// portal, agent, or public PDF route; no status transition; no send or email.
// ---------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string; operationId: string }> },
) {
  const { bookingId, operationId } = await params;

  // 1. Resolve the voucher for this operation (JSON read — no mutation).
  const readResponse = await fetch(`${API_BASE_URL}/bookings/${bookingId}/operations/${operationId}/voucher`, {
    headers: buildActorHeaders(request),
    cache: 'no-store',
  });

  if (!readResponse.ok) {
    return NextResponse.json(
      { message: 'Voucher is unavailable. Open in Classic.' },
      { status: readResponse.status === 404 ? 404 : 502 },
    );
  }

  const voucher = await readResponse.json().catch(() => null);
  const voucherId = voucher && typeof voucher === 'object' ? String((voucher as { id?: unknown }).id || '') : '';
  if (!voucherId) {
    return NextResponse.json({ message: 'No voucher to download. Open in Classic.' }, { status: 404 });
  }

  // 2. Stream the safe operational voucher PDF verbatim (incl. Content-Disposition).
  const pdfResponse = await fetch(`${API_BASE_URL}/vouchers/${voucherId}/pdf`, {
    headers: buildActorHeaders(request),
    cache: 'no-store',
  });

  return forwardProxyContentResponse(pdfResponse);
}
