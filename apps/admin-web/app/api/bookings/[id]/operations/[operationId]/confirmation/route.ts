import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../../auth/protected-response';
import { buildActorHeaders } from '../../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

function normalizeFormValue(value: FormDataEntryValue | null) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; operationId: string }> },
) {
  const { id, operationId } = await params;
  const formData = await request.formData();
  const response = await fetch(`${API_BASE_URL}/bookings/${id}/operations/${operationId}/confirmation`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({
      supplierConfirmationStatus: normalizeFormValue(formData.get('supplierConfirmationStatus')),
      confirmationReference: normalizeFormValue(formData.get('confirmationReference')),
      confirmationNotes: normalizeFormValue(formData.get('confirmationNotes')),
    }),
    cache: 'no-store',
    redirect: 'manual',
  });

  const referer = request.headers.get('referer');

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: `/bookings/${id}/operations`,
        genericError: 'Failed to update supplier confirmation.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || `/bookings/${id}/operations`, request.url);
  redirectUrl.searchParams.set('success', 'Supplier confirmation updated.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}

// ---------------------------------------------------------------------------
// Operations V2 — Phase 2B: manual confirmation-STATUS only (JSON, no redirect).
//
// Records supplier confirmation status ONLY. It forwards a single field to the
// confirmation endpoint and never touches email send, document preview, vouchers,
// finance, or dispatch. Status is limited to the Phase 2B set (CONFIRMED |
// REJECTED) so the email-implying statuses and a NOT_SENT reset can never be
// recorded here. The backend response is returned verbatim so the V2 control can
// surface 400 validation errors (e.g. confirm-without-supplier) inline.
// ---------------------------------------------------------------------------
const V2_ALLOWED_CONFIRM_STATUSES = new Set(['CONFIRMED', 'REJECTED']);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; operationId: string }> },
) {
  const { id, operationId } = await params;

  let payload: { supplierConfirmationStatus?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 });
  }

  const supplierConfirmationStatus = String(payload.supplierConfirmationStatus || '');
  if (!V2_ALLOWED_CONFIRM_STATUSES.has(supplierConfirmationStatus)) {
    return NextResponse.json(
      { message: 'Only CONFIRMED or REJECTED is allowed.' },
      { status: 400 },
    );
  }

  const response = await fetch(`${API_BASE_URL}/bookings/${id}/operations/${operationId}/confirmation`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({ supplierConfirmationStatus }),
    cache: 'no-store',
    redirect: 'manual',
  });

  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') || 'application/json' },
  });
}
