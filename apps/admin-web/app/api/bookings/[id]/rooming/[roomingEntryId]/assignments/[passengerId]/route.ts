import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../../../auth/protected-response';
import { buildActorHeaders } from '../../../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roomingEntryId: string; passengerId: string }> },
) {
  const { id, roomingEntryId, passengerId } = await params;

  const response = await fetch(`${API_BASE_URL}/bookings/${id}/rooming/${roomingEntryId}/assignments/${passengerId}`, {
    method: 'DELETE',
    headers: buildActorHeaders(request),
  });

  const referer = request.headers.get('referer');

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: `/bookings/${id}`,
        genericError: 'Failed to unassign passenger from room.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || `/bookings/${id}`, request.url);
  redirectUrl.searchParams.set('success', 'Passenger unassigned from room successfully.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
