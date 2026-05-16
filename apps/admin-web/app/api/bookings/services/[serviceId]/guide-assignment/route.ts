import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../auth/protected-response';
import { buildActorHeaders } from '../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

function parseTextList(value: FormDataEntryValue | null) {
  return String(value || '')
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;
  const formData = await request.formData();
  const response = await fetch(`${API_BASE_URL}/bookings/services/${serviceId}/guide-assignment`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({
      guideId: String(formData.get('guideId') || '').trim() || null,
      assignedTo: String(formData.get('assignedTo') || '').trim() || null,
      guidePhone: String(formData.get('guidePhone') || '').trim() || null,
      guideConfirmationStatus: String(formData.get('guideConfirmationStatus') || '').trim() || null,
      guideRequiredLanguages: parseTextList(formData.get('guideRequiredLanguages')),
      guideReportingTime: String(formData.get('guideReportingTime') || '').trim() || null,
      pickupTime: String(formData.get('pickupTime') || '').trim() || null,
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
        genericError: 'Failed to update guide assignment.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || '/bookings', request.url);
  redirectUrl.searchParams.set('success', 'Guide assignment updated successfully.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
