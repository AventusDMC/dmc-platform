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
  const response = await fetch(`${API_BASE_URL}/bookings/services/${serviceId}/restaurant-assignment`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({
      restaurantId: String(formData.get('restaurantId') || '').trim() || null,
      mealConfirmationStatus: String(formData.get('mealConfirmationStatus') || '').trim() || null,
      mealTiming: String(formData.get('mealTiming') || '').trim() || null,
      mealSeatingNotes: String(formData.get('mealSeatingNotes') || '').trim() || null,
      mealDietaryRequirements: parseTextList(formData.get('mealDietaryRequirements')),
      mealOperationalNotes: String(formData.get('mealOperationalNotes') || '').trim() || null,
      participantCount: String(formData.get('participantCount') || '').trim() || null,
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
        genericError: 'Failed to update restaurant assignment.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || '/bookings', request.url);
  redirectUrl.searchParams.set('success', 'Restaurant assignment updated successfully.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
