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
// GET only. A single safe read to the operations-scoped backend endpoint:
//   GET /bookings/:id/operations/:operationId/voucher/pdf
// (generateOperationalVoucherPdf — loose operational scoping + pure render: no
// status change, no sentAt, no audit, no email, and the PDF renders NO
// cost/finance data). No portal, agent, or public PDF route; no status
// transition; no send or email. The operationId is the primary key, so the
// browser never sees an internal voucher id and there is no second lookup.
// ---------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string; operationId: string }> },
) {
  const { bookingId, operationId } = await params;

  const pdfResponse = await fetch(
    `${API_BASE_URL}/bookings/${bookingId}/operations/${operationId}/voucher/pdf`,
    {
      headers: buildActorHeaders(request),
      cache: 'no-store',
    },
  );

  if (!pdfResponse.ok) {
    return NextResponse.json(
      { message: 'Voucher is unavailable. Open in Classic.' },
      { status: pdfResponse.status === 404 ? 404 : 502 },
    );
  }

  return forwardProxyContentResponse(pdfResponse);
}
