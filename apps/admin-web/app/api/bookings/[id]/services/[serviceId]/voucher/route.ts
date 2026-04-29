import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../../auth/protected-response';
import { buildActorHeaders } from '../../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; serviceId: string }> },
) {
  const { id, serviceId } = await params;
  const formData = await request.formData();
  const response = await fetch(`${API_BASE_URL}/bookings/${id}/services/${serviceId}/voucher`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({
      notes: String(formData.get('notes') || '').trim() || null,
    }),
  });

  const referer = request.headers.get('referer');

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: `/bookings/${id}?tab=operations`,
        genericError: 'Failed to generate service voucher.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || `/bookings/${id}?tab=operations`, request.url);
  redirectUrl.searchParams.set('tab', 'operations');
  redirectUrl.searchParams.set('success', 'Service voucher generated successfully.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
