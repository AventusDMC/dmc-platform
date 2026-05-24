import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../auth/protected-response';
import { buildActorHeaders } from '../../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

function normalizeFormValue(value: FormDataEntryValue | null) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function optionalFormValue(formData: FormData, name: string) {
  return formData.has(name) ? normalizeFormValue(formData.get(name)) : undefined;
}

// Operations Execution Lifecycle proxy. Dispatch cards POST a form with:
//   action: dispatch | start | complete | issue | resolve | cancel
//   notes?, issueType?, issueSeverity?, returnTo?
// We forward the action to the backend execution endpoint and redirect the
// operator back to the page they came from (returnTo or referer).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  const { serviceId } = await params;
  const formData = await request.formData();
  const payload = {
    action: optionalFormValue(formData, 'action'),
    notes: optionalFormValue(formData, 'notes'),
    issueType: optionalFormValue(formData, 'issueType'),
    issueSeverity: optionalFormValue(formData, 'issueSeverity'),
  };
  const returnTo = optionalFormValue(formData, 'returnTo');

  const response = await fetch(`${API_BASE_URL}/bookings/services/${serviceId}/execution`, {
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
        fallbackPath: returnTo || '/operations/dispatch',
        genericError: `Failed to ${payload.action || 'update'} operation.`,
      },
      response,
    );
  }

  const fallback = returnTo || request.headers.get('referer') || '/operations/dispatch';
  const target = new URL(fallback, request.url);
  target.searchParams.delete('warning');
  target.searchParams.delete('warningText');
  target.searchParams.delete('error');
  target.searchParams.set('success', `Operation ${payload.action || 'updated'}.`);
  return NextResponse.redirect(target, { status: 303 });
}
