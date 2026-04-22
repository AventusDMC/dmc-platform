import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../auth/protected-response';
import { buildActorHeaders } from '../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; passengerId: string }> },
) {
  const { id, passengerId } = await params;
  const formData = await request.formData();
  const intent = String(formData.get('intent') || 'update').trim();
  const referer = request.headers.get('referer');

  let response: Response;
  let successMessage = 'Passenger updated successfully.';

  if (intent === 'delete') {
    response = await fetch(`${API_BASE_URL}/bookings/${id}/passengers/${passengerId}`, {
      method: 'DELETE',
      headers: buildActorHeaders(request),
    });
    successMessage = 'Passenger deleted successfully.';
  } else if (intent === 'set-lead') {
    response = await fetch(`${API_BASE_URL}/bookings/${id}/passengers/${passengerId}/set-lead`, {
      method: 'POST',
      headers: buildActorHeaders(request),
    });
    successMessage = 'Lead passenger updated successfully.';
  } else {
    const firstName = String(formData.get('firstName') || '').trim();
    const lastName = String(formData.get('lastName') || '').trim();
    const title = String(formData.get('title') || '').trim();
    const notes = String(formData.get('notes') || '').trim();

    response = await fetch(`${API_BASE_URL}/bookings/${id}/passengers/${passengerId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...buildActorHeaders(request),
      },
      body: JSON.stringify({
        firstName,
        lastName,
        title: title || null,
        notes: notes || null,
      }),
    });
  }

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: `/bookings/${id}`,
        genericError:
          intent === 'delete'
            ? 'Failed to delete passenger.'
            : intent === 'set-lead'
              ? 'Failed to update lead passenger.'
              : 'Failed to update passenger.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || `/bookings/${id}`, request.url);
  redirectUrl.searchParams.set('success', successMessage);
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
