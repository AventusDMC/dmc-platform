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
  const isLead = formData.get('isLead') === 'on';

  const response = await fetch(`${API_BASE_URL}/bookings/${id}/passengers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({
      fullName,
      firstName,
      lastName,
      title: title || null,
      gender: gender || null,
      dateOfBirth: dateOfBirth || null,
      nationality: nationality || null,
      passportNumber: passportNumber || null,
      passportIssueDate: passportIssueDate || null,
      passportExpiryDate: passportExpiryDate || null,
      arrivalFlight: arrivalFlight || null,
      departureFlight: departureFlight || null,
      entryPoint: entryPoint || null,
      visaStatus: visaStatus || null,
      roomingNotes: roomingNotes || null,
      notes: notes || null,
      isLead,
    }),
  });

  const referer = request.headers.get('referer');

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: `/bookings/${id}`,
        genericError: 'Failed to create passenger.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || `/bookings/${id}`, request.url);
  redirectUrl.searchParams.set('success', 'Passenger created successfully.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
