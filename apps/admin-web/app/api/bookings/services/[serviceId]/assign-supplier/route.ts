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
  const supplierName = String(formData.get('supplierName') || '').trim();
  const supplierId = String(formData.get('supplierId') || '').trim();

  const response = await fetch(`${API_BASE_URL}/bookings/services/${serviceId}/assign-supplier`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({
      supplierId: supplierId || null,
      supplierName: supplierName || null,
    }),
  });

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer: request.headers.get('referer'),
        fallbackPath: '/bookings',
        genericError: 'Failed to assign supplier.',
      },
      response,
    );
  }

  const referer = request.headers.get('referer');
  const redirectUrl = new URL(referer || '/bookings', request.url);
  redirectUrl.searchParams.set('success', 'Supplier assignment updated successfully.');

  return NextResponse.redirect(redirectUrl, { status: 303 });
}
