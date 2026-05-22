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

function optionalFormValue(formData: FormData, name: string) {
  return formData.has(name) ? normalizeFormValue(formData.get(name)) : undefined;
}

function buildPayload(formData: FormData) {
  return {
    type: optionalFormValue(formData, 'type'),
    supplierId: optionalFormValue(formData, 'supplierId'),
    referenceId: optionalFormValue(formData, 'referenceId'),
    assignedTo: optionalFormValue(formData, 'assignedTo'),
    guidePhone: optionalFormValue(formData, 'guidePhone'),
    guideRequiredLanguages: optionalFormValue(formData, 'guideRequiredLanguages'),
    guideReportingTime: optionalFormValue(formData, 'guideReportingTime'),
    vehicleId: optionalFormValue(formData, 'vehicleId'),
    serviceDate: optionalFormValue(formData, 'serviceDate'),
    startTime: optionalFormValue(formData, 'startTime'),
    pickupTime: optionalFormValue(formData, 'pickupTime'),
    pickupLocation: optionalFormValue(formData, 'pickupLocation'),
    meetingPoint: optionalFormValue(formData, 'meetingPoint'),
    participantCount: optionalFormValue(formData, 'participantCount'),
    confirmationNumber: optionalFormValue(formData, 'confirmationNumber'),
    notes: optionalFormValue(formData, 'notes'),
    status: optionalFormValue(formData, 'status'),
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
  redirectUrl.searchParams.delete('warning');
  redirectUrl.searchParams.delete('warningText');
  redirectUrl.searchParams.delete('error');
  redirectUrl.searchParams.delete('service');
  redirectUrl.searchParams.set('success', 'Booking service created successfully.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
