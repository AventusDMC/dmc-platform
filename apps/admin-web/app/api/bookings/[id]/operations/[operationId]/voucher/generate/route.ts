import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../../../auth/protected-response';
import { buildActorHeaders } from '../../../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; operationId: string }> },
) {
  const { id, operationId } = await params;
  const formData = await request.formData();
  const notes = String(formData.get('notes') || '').trim() || null;

  const response = await fetch(`${API_BASE_URL}/bookings/${id}/operations/${operationId}/voucher/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({ notes }),
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
        genericError: 'Failed to generate voucher.',
      },
      response,
    );
  }

  // Backend returns { voucher, warnings: string[] }. Surface warnings to the
  // operator via the operations grid's banner — they're non-blocking but worth
  // showing (e.g. pending passenger names, missing operational time).
  const payload = await response.json().catch(() => null);
  const warnings: string[] = Array.isArray(payload?.warnings) ? payload.warnings : [];

  const redirectUrl = new URL(referer || `/bookings/${id}/operations`, request.url);
  redirectUrl.searchParams.delete('warning');
  redirectUrl.searchParams.delete('error');
  redirectUrl.searchParams.delete('warningText');
  if (warnings.length > 0) {
    redirectUrl.searchParams.set('warningText', `Voucher generated with warnings: ${warnings.join(' ')}`);
  }
  redirectUrl.searchParams.set('success', 'Voucher generated.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
