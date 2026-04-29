import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../auth/protected-response';
import { buildActorHeaders } from '../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

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
    const fullName = String(formData.get('fullName') || [firstName, lastName].filter(Boolean).join(' ')).trim();
    const title = String(formData.get('title') || '').trim();
    const gender = String(formData.get('gender') || '').trim();
    const dateOfBirth = String(formData.get('dateOfBirth') || '').trim();
    const nationality = String(formData.get('nationality') || '').trim();
    const passportNumber = String(formData.get('passportNumber') || '').trim();
    const passportIssueDate = String(formData.get('passportIssueDate') || '').trim();
    const passportExpiryDate = String(formData.get('passportExpiryDate') || '').trim();
    const arrivalFlight = String(formData.get('arrivalFlight') || '').trim();
    const departureFlight = String(formData.get('departureFlight') || '').trim();
    const entryPoint = String(formData.get('entryPoint') || '').trim();
    const visaStatus = String(formData.get('visaStatus') || '').trim();
    const roomingNotes = String(formData.get('roomingNotes') || '').trim();
    const notes = String(formData.get('notes') || '').trim();

    const payload: Record<string, unknown> = {
      fullName,
      firstName,
      lastName,
      title: title || null,
      gender: gender || null,
      dateOfBirth: dateOfBirth || null,
      nationality: nationality || null,
      passportIssueDate: passportIssueDate || null,
      passportExpiryDate: passportExpiryDate || null,
      arrivalFlight: arrivalFlight || null,
      departureFlight: departureFlight || null,
      entryPoint: entryPoint || null,
      visaStatus: visaStatus || null,
      roomingNotes: roomingNotes || null,
      notes: notes || null,
    };
    if (passportNumber) {
      payload.passportNumber = passportNumber;
    }

    response = await fetch(`${API_BASE_URL}/bookings/${id}/passengers/${passengerId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...buildActorHeaders(request),
      },
      body: JSON.stringify(payload),
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
