import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../../../auth/protected-response';
import { buildActorHeaders } from '../../../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string; serviceId: string }> },
) {
  const { id, dayId, serviceId } = await params;
  const formData = await request.formData();
  const intent = normalizeFormValue(formData.get('_method'));
  const method = intent === 'DELETE' ? 'DELETE' : 'PATCH';
  const response = await fetch(`${API_BASE_URL}/bookings/${id}/days/${dayId}/services/${serviceId}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: method === 'DELETE' ? undefined : JSON.stringify(buildPayload(formData)),
  });

  const referer = request.headers.get('referer');

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: `/bookings/${id}?tab=operations`,
        genericError: method === 'DELETE' ? 'Failed to delete booking service.' : 'Failed to update booking service.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || `/bookings/${id}?tab=operations`, request.url);
  redirectUrl.searchParams.set('tab', 'operations');
  redirectUrl.searchParams.set('success', method === 'DELETE' ? 'Booking service deleted successfully.' : 'Booking service updated successfully.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
