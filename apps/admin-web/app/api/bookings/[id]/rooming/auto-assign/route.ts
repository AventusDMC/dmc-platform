import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../auth/protected-response';
import { buildActorHeaders } from '../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// Preferred-rooming auto-allocation — pairs unassigned passengers into
// twin/double rooms (odd one out → single). Server-action form POST that
// redirects back to the rooming tab with a result message.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const response = await fetch(`${API_BASE_URL}/bookings/${id}/rooming/auto-assign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({}),
  });

  const referer = request.headers.get('referer');

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: `/bookings/${id}`,
        genericError: 'Failed to auto-allocate rooming.',
      },
      response,
    );
  }

  const result = (await response.json().catch(() => null)) as
    | { roomsCreated?: number; passengersAssigned?: number; message?: string }
    | null;

  const redirectUrl = new URL(referer || `/bookings/${id}`, request.url);
  redirectUrl.searchParams.set(
    'success',
    result?.message || 'Rooming auto-allocated successfully.',
  );
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
