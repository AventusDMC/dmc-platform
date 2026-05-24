import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../auth/protected-response';
import { buildActorHeaders } from '../../../../bookings/actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(request: NextRequest) {
  const response = await fetch(`${API_BASE_URL}/operations/simulation/scale/clear`, {
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
        genericError: 'Failed to clear synthetic data.',
      },
      response,
    );
  }
  const body = await response.json().catch(() => null);
  const url = new URL('/operations/simulation/scale', request.url);
  url.searchParams.set('success', body ? `Cleared ${body.deletedCount} synthetic services.` : 'Synthetic data cleared.');
  return NextResponse.redirect(url, { status: 303 });
}
