import { NextRequest } from 'next/server';
import { forwardProxyJsonResponse } from '../../../proxy-response';
import { buildActorHeaders } from '../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
const BOOKING_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || !BOOKING_UUID_PATTERN.test(id)) {
    return Response.json(
      {
        message: 'Invoice generation requires a booking UUID. Booking references/codes are display-only.',
      },
      { status: 400 },
    );
  }

  const body = await request.text();

  const response = await fetch(`${API_BASE_URL}/bookings/${id}/invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body,
  });

  return forwardProxyJsonResponse(response);
}
