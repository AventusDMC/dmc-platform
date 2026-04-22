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
  const roomType = String(formData.get('roomType') || '').trim();
  const occupancy = String(formData.get('occupancy') || 'unknown').trim();
  const notes = String(formData.get('notes') || '').trim();
  const sortOrderValue = String(formData.get('sortOrder') || '').trim();

  const response = await fetch(`${API_BASE_URL}/bookings/${id}/rooming`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({
      roomType: roomType || null,
      occupancy,
      notes: notes || null,
      sortOrder: sortOrderValue ? Number(sortOrderValue) : undefined,
    }),
  });

  const referer = request.headers.get('referer');

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: `/bookings/${id}`,
        genericError: 'Failed to create rooming entry.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || `/bookings/${id}`, request.url);
  redirectUrl.searchParams.set('success', 'Rooming entry created successfully.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
