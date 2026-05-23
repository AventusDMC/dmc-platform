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

  const redirectUrl = new URL(`/bookings/${id}`, request.url);
  redirectUrl.searchParams.set('tab', 'operations');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
