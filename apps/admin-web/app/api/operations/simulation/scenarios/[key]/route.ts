import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../auth/protected-response';
import { buildActorHeaders } from '../../../../bookings/actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

function normalizeFormValue(value: FormDataEntryValue | null) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

// POST /api/operations/simulation/scenarios/:key — applies a simulation
// scenario to the picked booking, then redirects back to /operations/simulation
// with success or error so the operator sees feedback inline.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const formData = await request.formData();
  const bookingId = normalizeFormValue(formData.get('bookingId'));

  if (!bookingId) {
    const url = new URL('/operations/simulation', request.url);
    url.searchParams.set('error', 'Pick a booking before applying a scenario.');
    return NextResponse.redirect(url, { status: 303 });
  }

  const response = await fetch(`${API_BASE_URL}/operations/simulation/scenarios/${key}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({ bookingId }),
    cache: 'no-store',
    redirect: 'manual',
  });

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer: request.headers.get('referer'),
        fallbackPath: `/operations/simulation?bookingId=${encodeURIComponent(bookingId)}`,
        genericError: `Failed to apply ${key.replace(/-/g, ' ')} scenario.`,
      },
      response,
    );
  }

  const url = new URL('/operations/simulation', request.url);
  url.searchParams.set('bookingId', bookingId);
  url.searchParams.set('success', `Scenario "${key.replace(/-/g, ' ')}" applied. Open Dispatch to resolve.`);
  return NextResponse.redirect(url, { status: 303 });
}
