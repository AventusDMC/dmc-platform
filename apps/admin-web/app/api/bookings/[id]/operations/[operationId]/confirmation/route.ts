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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; operationId: string }> },
) {
  const { id, operationId } = await params;
  const formData = await request.formData();
  const response = await fetch(`${API_BASE_URL}/bookings/${id}/operations/${operationId}/confirmation`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({
      supplierConfirmationStatus: normalizeFormValue(formData.get('supplierConfirmationStatus')),
      confirmationReference: normalizeFormValue(formData.get('confirmationReference')),
      confirmationNotes: normalizeFormValue(formData.get('confirmationNotes')),
    }),
    cache: 'no-store',
    redirect: 'manual',
  });

  const referer = request.headers.get('referer');

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: `/bookings/${id}/operations`,
        genericError: 'Failed to update supplier confirmation.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || `/bookings/${id}/operations`, request.url);
  redirectUrl.searchParams.set('success', 'Supplier confirmation updated.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
