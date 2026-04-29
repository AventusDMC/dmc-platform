import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../../auth/protected-response';
import { buildActorHeaders } from '../../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

function normalizeFormValue(value: FormDataEntryValue | null) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function buildPayload(formData: FormData) {
  return {
    type: normalizeFormValue(formData.get('type')),
    supplierId: normalizeFormValue(formData.get('supplierId')),
    referenceId: normalizeFormValue(formData.get('referenceId')),
    assignedTo: normalizeFormValue(formData.get('assignedTo')),
    guidePhone: normalizeFormValue(formData.get('guidePhone')),
    vehicleId: normalizeFormValue(formData.get('vehicleId')),
    pickupTime: normalizeFormValue(formData.get('pickupTime')),
    confirmationNumber: normalizeFormValue(formData.get('confirmationNumber')),
    notes: normalizeFormValue(formData.get('notes')),
    status: normalizeFormValue(formData.get('status')),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> },
) {
  const { id, dayId } = await params;
  const response = await fetch(`${API_BASE_URL}/bookings/${id}/days/${dayId}/services`, {
    headers: buildActorHeaders(request),
    cache: 'no-store',
  });

  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/json',
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> },
) {
  const { id, dayId } = await params;
  const formData = await request.formData();
  const response = await fetch(`${API_BASE_URL}/bookings/${id}/days/${dayId}/services`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify(buildPayload(formData)),
  });

  const referer = request.headers.get('referer');

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: `/bookings/${id}?tab=operations`,
        genericError: 'Failed to create booking service.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || `/bookings/${id}?tab=operations`, request.url);
  redirectUrl.searchParams.set('tab', 'operations');
  redirectUrl.searchParams.set('success', 'Booking service created successfully.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
