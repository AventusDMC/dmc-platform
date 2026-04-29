import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../auth/protected-response';
import { buildActorHeaders } from '../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roomingEntryId: string }> },
) {
  const { id, roomingEntryId } = await params;
  const formData = await request.formData();
  const intent = String(formData.get('intent') || 'update').trim();
  const referer = request.headers.get('referer');

  let response: Response;
  let successMessage = 'Rooming entry updated successfully.';

  if (intent === 'delete') {
    response = await fetch(`${API_BASE_URL}/bookings/${id}/rooming/${roomingEntryId}`, {
      method: 'DELETE',
      headers: buildActorHeaders(request),
    });
    successMessage = 'Rooming entry deleted successfully.';
  } else {
    const roomType = String(formData.get('roomType') || '').trim();
    const occupancy = String(formData.get('occupancy') || 'unknown').trim();
    const notes = String(formData.get('notes') || '').trim();
    const sortOrderValue = String(formData.get('sortOrder') || '').trim();

    response = await fetch(`${API_BASE_URL}/bookings/${id}/rooming/${roomingEntryId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...buildActorHeaders(request),
      },
      body: JSON.stringify({
        roomType: roomType || null,
        occupancy,
        notes: notes || null,
        sortOrder: sortOrderValue ? Number(sortOrderValue) : 0,
      }),
    });
  }

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: `/bookings/${id}`,
        genericError: intent === 'delete' ? 'Failed to delete rooming entry.' : 'Failed to update rooming entry.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || `/bookings/${id}`, request.url);
  redirectUrl.searchParams.set('success', successMessage);
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
