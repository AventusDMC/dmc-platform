import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../../auth/protected-response';
import { buildActorHeaders } from '../../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roomingEntryId: string }> },
) {
  const { id, roomingEntryId } = await params;
  const formData = await request.formData();
  const passengerId = String(formData.get('passengerId') || '').trim();

  const response = await fetch(`${API_BASE_URL}/bookings/${id}/rooming/${roomingEntryId}/assignments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({
      passengerId,
    }),
  });

  const referer = request.headers.get('referer');

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: `/bookings/${id}`,
        genericError: 'Failed to assign passenger to room.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || `/bookings/${id}`, request.url);
  redirectUrl.searchParams.set('success', 'Passenger assigned to room successfully.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
