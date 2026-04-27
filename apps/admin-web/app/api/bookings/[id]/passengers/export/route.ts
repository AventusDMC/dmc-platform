import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../actorHeaders';
import { buildPassengerManifestExportApiUrl } from '../../../passenger-manifest-export-url';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const EXCEL_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const response = await fetch(buildPassengerManifestExportApiUrl(API_BASE_URL, id), {
    headers: {
      ...buildActorHeaders(request),
    },
    cache: 'no-store',
    redirect: 'manual',
  });
  const headers = new Headers(response.headers);
  headers.set('Content-Type', headers.get('Content-Type') || EXCEL_CONTENT_TYPE);
  headers.set('Content-Disposition', headers.get('Content-Disposition') || `attachment; filename="${id}-passenger-manifest.xlsx"`);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
