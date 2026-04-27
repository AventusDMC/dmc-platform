import { NextRequest, NextResponse } from 'next/server';
import { buildActorHeaders } from '../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const response = await fetch(`${API_BASE_URL}/bookings/${id}/guarantee-letter`, {
    headers: buildActorHeaders(request),
    cache: 'no-store',
  });

  const body = await response.arrayBuffer();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/pdf',
      'Content-Disposition': response.headers.get('content-disposition') || `attachment; filename="${id}-guarantee-letter.pdf"`,
    },
  });
}
