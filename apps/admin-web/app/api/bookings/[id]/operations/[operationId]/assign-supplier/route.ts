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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; operationId: string }> },
) {
  const { id, operationId } = await params;
  const formData = await request.formData();
  const assignedSupplierId = optionalFormValue(formData, 'assignedSupplierId') ?? optionalFormValue(formData, 'supplierId');
  const payload = {
    bookingId: optionalFormValue(formData, 'bookingId') || id,
    operationId: optionalFormValue(formData, 'operationId') || operationId,
    assignedSupplierId,
    supplierId: assignedSupplierId,
    assignmentStatus: optionalFormValue(formData, 'assignmentStatus'),
    assignmentNotes: optionalFormValue(formData, 'assignmentNotes'),
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

  const referer = request.headers.get('referer');

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: `/bookings/${id}/operations`,
        genericError: 'Failed to assign supplier.',
      },
      response,
    );
  }

  const savedPayload = await response.json().catch(() => null);
  console.info('[booking-operation-assignment-save]', {
    bookingId: id,
    operationId,
    incomingOperationId: payload.operationId,
    incomingAssignedSupplierId: payload.assignedSupplierId ?? null,
    returnedId: savedPayload?.id ?? null,
    returnedAssignedSupplierId: savedPayload?.assignedSupplierId ?? null,
    returnedAssignmentStatus: savedPayload?.assignmentStatus ?? null,
  });

  const redirectUrl = new URL(referer || `/bookings/${id}/operations`, request.url);
  redirectUrl.searchParams.set('success', 'Supplier assignment updated.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
