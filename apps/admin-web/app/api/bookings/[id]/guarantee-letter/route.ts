import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}
const PDF_CONTENT_TYPE = 'application/pdf';
const DEFAULT_EXPORT_FILENAME = 'guarantee-letter.pdf';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const response = await fetch(`${API_BASE_URL}/bookings/${id}/guarantee-letter`, {
    headers: buildActorHeaders(request),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text();
    return new Response(errorText || `Guarantee letter export failed with status ${response.status}`, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  const buffer = await response.arrayBuffer();
  return new Response(buffer, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      'Content-Type': PDF_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${DEFAULT_EXPORT_FILENAME}"`,
    },
  });
}
