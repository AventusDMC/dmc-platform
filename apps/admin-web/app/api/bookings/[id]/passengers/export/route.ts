import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../actorHeaders';
import { buildPassengerManifestExportApiUrl } from '../../../passenger-manifest-export-url';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}
const REQUIRED_API_BASE_URL = API_BASE_URL;
const EXCEL_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DEFAULT_EXPORT_FILENAME = 'passenger-manifest.xlsx';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const response = await fetch(buildPassengerManifestExportApiUrl(REQUIRED_API_BASE_URL, id), {
    headers: {
      ...buildActorHeaders(request),
    },
    cache: 'no-store',
    redirect: 'manual',
  });

  if (!response.ok) {
    const errorText = await response.text();
    return new Response(errorText || `Passenger manifest export failed with status ${response.status}`, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  const body = await response.arrayBuffer();
  const headers = new Headers();
  headers.set('Content-Type', EXCEL_CONTENT_TYPE);
  headers.set('Content-Disposition', `attachment; filename="${DEFAULT_EXPORT_FILENAME}"`);

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
