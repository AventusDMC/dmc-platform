import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../auth/protected-response';
import { buildActorHeaders } from '../../../bookings/actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const formData = await request.formData();
  const response = await fetch(`${API_BASE_URL}/vouchers/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({
      status: String(formData.get('status') || '').trim(),
    }),
  });

  const referer = request.headers.get('referer');

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: '/bookings',
        genericError: 'Failed to update voucher status.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || '/bookings', request.url);
  redirectUrl.searchParams.set('success', 'Voucher status updated successfully.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
