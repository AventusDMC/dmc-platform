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
  const action = String(formData.get('action') || '').trim();
  const note = String(formData.get('note') || '').trim();

  const response = await fetch(`${API_BASE_URL}/bookings/services/${serviceId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({
      action,
      note,
    }),
  });

  const referer = request.headers.get('referer');

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: '/operations',
        genericError: 'Failed to apply manual service action.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || '/operations', request.url);
  redirectUrl.searchParams.set('success', 'Manual service action applied successfully.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
