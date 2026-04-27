import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../bookings/actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const response = await fetch(`${API_BASE_URL}/vouchers/${id}/pdf`, {
    headers: buildActorHeaders(request),
    cache: 'no-store',
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/pdf',
      'Content-Disposition': response.headers.get('content-disposition') || `attachment; filename="${id}-voucher.pdf"`,
    },
  });
}
