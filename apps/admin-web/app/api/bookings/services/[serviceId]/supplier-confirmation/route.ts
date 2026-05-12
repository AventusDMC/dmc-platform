import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../auth/protected-response';
import { buildActorHeaders } from '../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  const { serviceId } = await params;
  const formData = await request.formData();
  const supplierConfirmationStatus = String(formData.get('supplierConfirmationStatus') || 'NOT_SENT').trim();
  const supplierReference = String(formData.get('supplierReference') || '').trim();
  const supplierRemarks = String(formData.get('supplierRemarks') || '').trim();
  const confirmationDeadline = String(formData.get('confirmationDeadline') || '').trim();

  const response = await fetch(`${API_BASE_URL}/bookings/services/${serviceId}/supplier-confirmation`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({
      supplierConfirmationStatus,
      supplierReference: supplierReference || null,
      supplierRemarks: supplierRemarks || null,
      confirmationDeadline: confirmationDeadline || null,
    }),
  });

  const referer = request.headers.get('referer');

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: '/operations',
        genericError: 'Failed to update supplier confirmation.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || '/operations', request.url);
  redirectUrl.searchParams.set('success', 'Supplier confirmation updated successfully.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
