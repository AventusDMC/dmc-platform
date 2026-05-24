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
  { params }: { params: Promise<{ serviceId: string }> },
) {
  const { serviceId } = await params;
  const formData = await request.formData();
  const severity = normalizeFormValue(formData.get('severity'));
  const notes = normalizeFormValue(formData.get('notes'));
  const response = await fetch(`${API_BASE_URL}/bookings/services/${serviceId}/recovery/escalate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildActorHeaders(request) },
    body: JSON.stringify({ severity, notes }),
    cache: 'no-store',
    redirect: 'manual',
  });
  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer: request.headers.get('referer'),
        fallbackPath: '/operations/recovery',
        genericError: 'Failed to escalate.',
      },
      response,
    );
  }
  const referer = request.headers.get('referer');
  const target = referer ? new URL(referer, request.url) : new URL('/operations/recovery', request.url);
  target.searchParams.set('success', `Escalated to ${severity}.`);
  return NextResponse.redirect(target, { status: 303 });
}
