import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../../auth/protected-response';
import { buildActorHeaders } from '../../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

function normalizeFormValue(value: FormDataEntryValue | null) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

// Per-row assignment of vehicle and/or driver from the operations grid.
// Independent of the supplier assignment endpoint so the operator can fill
// in the driver later without re-triggering the supplier confirmation flow.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; operationId: string }> },
) {
  const { id, operationId } = await params;
  const formData = await request.formData();
  const payload = {
    vehicleId: formData.has('vehicleId') ? normalizeFormValue(formData.get('vehicleId')) : undefined,
    driverId: formData.has('driverId') ? normalizeFormValue(formData.get('driverId')) : undefined,
  };

  const response = await fetch(`${API_BASE_URL}/bookings/${id}/operations/${operationId}/assign-transport`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
    redirect: 'manual',
  });

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer: request.headers.get('referer'),
        fallbackPath: `/bookings/${id}?tab=operations`,
        genericError: 'Failed to assign vehicle/driver.',
      },
      response,
    );
  }

  const redirectUrl = new URL(`/bookings/${id}`, request.url);
  redirectUrl.searchParams.set('tab', 'operations');
  let target = redirectUrl;
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refererUrl = new URL(referer, request.url);
      if (refererUrl.origin === request.nextUrl.origin && refererUrl.pathname.startsWith(`/bookings/${id}`)) {
        target = refererUrl;
      }
    } catch {
      target = redirectUrl;
    }
  }
  return NextResponse.redirect(target, { status: 303 });
}
