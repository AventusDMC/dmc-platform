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
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    const assignedSupplierId = body.assignedSupplierId === undefined ? body.supplierId : body.assignedSupplierId;
    return {
      bookingId: body.bookingId,
      operationId: body.operationId,
      assignedSupplierId: assignedSupplierId === undefined ? undefined : assignedSupplierId || null,
      supplierId: assignedSupplierId === undefined ? undefined : assignedSupplierId || null,
      assignmentStatus: body.assignmentStatus === undefined ? undefined : body.assignmentStatus || null,
      assignmentNotes: body.assignmentNotes === undefined ? undefined : body.assignmentNotes || null,
    };
  }

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
  console.info('[booking-operation-assignment-proxy] Payload sent', {
    bookingId: id,
    operationId,
    payload,
  });

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
  const wantsJson = request.headers.get('accept')?.includes('application/json') || request.headers.get('x-requested-with') === 'fetch';

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    console.info('[booking-operation-assignment-proxy] Endpoint response', {
      ok: false,
      status: response.status,
      response: errorPayload,
    });
    if (wantsJson) {
      return NextResponse.json(errorPayload || { message: 'Failed to assign supplier.' }, { status: response.status });
    }

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
  console.info('[booking-operation-assignment-proxy] Endpoint response', {
    ok: true,
    status: response.status,
    response: savedPayload,
  });
  console.info('[booking-operation-assignment-save]', {
    bookingId: id,
    operationId,
    incomingOperationId: payload.operationId,
    incomingAssignedSupplierId: payload.assignedSupplierId ?? null,
    returnedId: savedPayload?.id ?? null,
    returnedAssignedSupplierId: savedPayload?.assignedSupplierId ?? null,
    returnedAssignmentStatus: savedPayload?.assignmentStatus ?? null,
  });

  if (wantsJson) {
    return NextResponse.json({
      ok: true,
      operationId,
      assignedSupplierId: savedPayload?.assignedSupplierId ?? null,
      assignmentStatus: savedPayload?.assignmentStatus ?? null,
      row: savedPayload,
    });
  }

  const redirectUrl = new URL(referer || `/bookings/${id}/operations`, request.url);
  redirectUrl.searchParams.set('success', 'Supplier assignment updated.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
