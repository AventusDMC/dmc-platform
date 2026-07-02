import { NextRequest, NextResponse } from 'next/server';
import { buildActorHeaders } from '../../../../../bookings/actorHeaders';
import { buildVoucherPreviewVM } from '../../../../../../operations/v2/ops-voucher-preview-vm';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// ---------------------------------------------------------------------------
// Operations V2 — Phase 2D: read-only voucher PREVIEW (sanitized JSON).
//
// GET only. Calls the existing backend operational-voucher READ, then returns
// ONLY the allowlist-mapped, cost-free preview VM. The raw voucher record (full
// supplier object incl. transportDiscountPercent, raw snapshotJson, any
// cost/reference/token) is dropped SERVER-SIDE and never reaches the browser.
// No mutation, no email, no PDF/download, no status change.
// ---------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string; operationId: string }> },
) {
  const { bookingId, operationId } = await params;

  const response = await fetch(`${API_BASE_URL}/bookings/${bookingId}/operations/${operationId}/voucher`, {
    method: 'GET',
    headers: { ...buildActorHeaders(request) },
    cache: 'no-store',
  });

  if (!response.ok) {
    return NextResponse.json(
      { message: 'Voucher preview is unavailable. Open in Classic.' },
      { status: response.status === 404 ? 404 : 502 },
    );
  }

  const raw = await response.json().catch(() => null);
  if (!raw || typeof raw !== 'object') {
    return NextResponse.json({ message: 'Voucher preview is unavailable. Open in Classic.' }, { status: 502 });
  }

  // SANITIZE: return only the safe preview VM.
  const preview = buildVoucherPreviewVM(raw);
  return NextResponse.json(preview, { status: 200, headers: { 'cache-control': 'no-store' } });
}
