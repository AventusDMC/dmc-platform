import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../../auth/protected-response';
import { buildActorHeaders } from '../../../../../bookings/actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// POST applies a scale preset. Form-encoded body — redirects back to
// /operations/simulation/scale with a success/error param so the operator
// sees feedback inline.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const response = await fetch(`${API_BASE_URL}/operations/simulation/scale/presets/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildActorHeaders(request) },
    body: JSON.stringify({}),
    cache: 'no-store',
    redirect: 'manual',
  });
  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer: request.headers.get('referer'),
        fallbackPath: '/operations/simulation/scale',
        genericError: `Failed to apply ${key.replace(/-/g, ' ')} preset.`,
      },
      response,
    );
  }
  const body = await response.json().catch(() => null);
  const url = new URL('/operations/simulation/scale', request.url);
  url.searchParams.set(
    'success',
    body
      ? `${body.preset} applied — ${body.createdServices} services, ${body.incidentsCreated} incidents, ${body.conflictsForced} forced conflicts.`
      : `Preset ${key} applied.`,
  );
  return NextResponse.redirect(url, { status: 303 });
}
