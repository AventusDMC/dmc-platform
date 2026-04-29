import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../auth/protected-response';
import { buildActorHeaders } from '../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

function parseOptionalNumber(value: FormDataEntryValue | null) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  const { serviceId } = await params;
  const formData = await request.formData();
  const response = await fetch(`${API_BASE_URL}/bookings/services/${serviceId}/operational`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({
      serviceDate: String(formData.get('serviceDate') || '').trim() || null,
      startTime: String(formData.get('startTime') || '').trim() || null,
      pickupTime: String(formData.get('pickupTime') || '').trim() || null,
      pickupLocation: String(formData.get('pickupLocation') || '').trim() || null,
      meetingPoint: String(formData.get('meetingPoint') || '').trim() || null,
      participantCount: parseOptionalNumber(formData.get('participantCount')),
      adultCount: parseOptionalNumber(formData.get('adultCount')),
      childCount: parseOptionalNumber(formData.get('childCount')),
      supplierReference: String(formData.get('supplierReference') || '').trim() || null,
      reconfirmationRequired: formData.get('reconfirmationRequired') === 'on',
      reconfirmationDueAt: String(formData.get('reconfirmationDueAt') || '').trim() || null,
      note: String(formData.get('note') || '').trim() || null,
    }),
  });

  const referer = request.headers.get('referer');

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: '/bookings',
        genericError: 'Failed to update operational details.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || '/bookings', request.url);
  redirectUrl.searchParams.set('success', 'Operational details updated successfully.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
