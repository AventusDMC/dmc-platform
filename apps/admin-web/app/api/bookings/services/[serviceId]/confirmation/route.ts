import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../auth/protected-response';
import { buildActorHeaders } from '../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  const { serviceId } = await params;
  const formData = await request.formData();
  const confirmationStatus = String(formData.get('confirmationStatus') || 'pending');
  const supplierReference = String(formData.get('supplierReference') || formData.get('confirmationNumber') || '').trim();
  const notes = String(formData.get('notes') || '').trim();

  const response = await fetch(`${API_BASE_URL}/bookings/services/${serviceId}/confirmation`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({
      confirmationStatus,
      confirmationNumber: supplierReference || null,
      supplierReference: supplierReference || null,
      notes: notes || null,
    }),
  });

  const referer = request.headers.get('referer');

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: '/bookings',
        genericError: 'Failed to update confirmation.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || '/bookings', request.url);
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.toLowerCase().includes('application/json') ? await response.json().catch(() => null) : null;

  if (payload?.warning) {
    redirectUrl.searchParams.set('warningText', String(payload.warning));
  } else {
    redirectUrl.searchParams.set('success', 'Confirmation updated successfully.');
  }

  return NextResponse.redirect(redirectUrl, { status: 303 });
}
