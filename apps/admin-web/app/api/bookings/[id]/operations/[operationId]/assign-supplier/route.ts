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

function optionalFormValue(formData: FormData, name: string) {
  return formData.has(name) ? normalizeFormValue(formData.get(name)) : undefined;
}

async function readAssignmentPayload(request: NextRequest) {
  const formData = await request.formData();
  const assignedSupplierId = optionalFormValue(formData, 'assignedSupplierId') ?? optionalFormValue(formData, 'supplierId');
  return {
    bookingId: optionalFormValue(formData, 'bookingId'),
    operationId: optionalFormValue(formData, 'operationId'),
    assignedSupplierId,
    supplierId: assignedSupplierId,
    assignmentStatus: optionalFormValue(formData, 'assignmentStatus'),
    assignmentNotes: optionalFormValue(formData, 'assignmentNotes'),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; operationId: string }> },
) {
  const { id, operationId } = await params;
  const incomingPayload = await readAssignmentPayload(request);
  const payload = {
    bookingId: incomingPayload.bookingId || id,
    operationId: incomingPayload.operationId || operationId,
    assignedSupplierId: incomingPayload.assignedSupplierId,
    supplierId: incomingPayload.supplierId,
    assignmentStatus: incomingPayload.assignmentStatus,
    assignmentNotes: incomingPayload.assignmentNotes,
  };

  const response = await fetch(`${API_BASE_URL}/bookings/${id}/operations/${operationId}/assign-supplier`, {
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
        genericError: 'Failed to assign supplier.',
      },
      response,
    );
  }

  // Default destination: the booking operations tab.
  const redirectUrl = new URL(`/bookings/${id}`, request.url);
  redirectUrl.searchParams.set('tab', 'operations');

  // Prefer returning the operator to the exact page they submitted from (the
  // operations grid page or the operations tab) so the freshly persisted
  // assignment is visible after the no-store refetch, instead of bouncing them
  // elsewhere. Only honour a same-origin referer scoped to this booking.
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
