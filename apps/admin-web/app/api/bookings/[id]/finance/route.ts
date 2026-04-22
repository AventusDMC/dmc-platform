import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../auth/protected-response';
import { buildActorHeaders } from '../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const formData = await request.formData();
  const clientInvoiceStatus = String(formData.get('clientInvoiceStatus') || '').trim();
  const supplierPaymentStatus = String(formData.get('supplierPaymentStatus') || '').trim();

  const response = await fetch(`${API_BASE_URL}/bookings/${id}/finance`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({
      clientInvoiceStatus,
      supplierPaymentStatus,
    }),
  });

  const referer = request.headers.get('referer');

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: `/bookings/${id}`,
        genericError: 'Failed to update booking finance statuses.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || `/bookings/${id}`, request.url);
  redirectUrl.searchParams.set('success', 'Booking finance statuses updated successfully.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
