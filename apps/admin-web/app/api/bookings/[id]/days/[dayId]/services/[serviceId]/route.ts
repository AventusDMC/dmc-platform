import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../../../../auth/protected-response';
import { buildActorHeaders } from '../../../../../actorHeaders';

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

function buildPayload(formData: FormData) {
  return {
    type: optionalFormValue(formData, 'type'),
    supplierId: optionalFormValue(formData, 'supplierId'),
    referenceId: optionalFormValue(formData, 'referenceId'),
    assignedTo: optionalFormValue(formData, 'assignedTo'),
    guidePhone: optionalFormValue(formData, 'guidePhone'),
    guideRequiredLanguages: optionalFormValue(formData, 'guideRequiredLanguages'),
    guideReportingTime: optionalFormValue(formData, 'guideReportingTime'),
    vehicleId: optionalFormValue(formData, 'vehicleId'),
    serviceDate: optionalFormValue(formData, 'serviceDate'),
    startTime: optionalFormValue(formData, 'startTime'),
    pickupTime: optionalFormValue(formData, 'pickupTime'),
    pickupLocation: optionalFormValue(formData, 'pickupLocation'),
    meetingPoint: optionalFormValue(formData, 'meetingPoint'),
    participantCount: optionalFormValue(formData, 'participantCount'),
    assignmentStatus: optionalFormValue(formData, 'assignmentStatus'),
    operationalNotes: optionalFormValue(formData, 'operationalNotes'),
    supplierConfirmationStatus: optionalFormValue(formData, 'supplierConfirmationStatus'),
    confirmationReference: optionalFormValue(formData, 'confirmationReference'),
    confirmationNotes: optionalFormValue(formData, 'confirmationNotes'),
    confirmationNumber: optionalFormValue(formData, 'confirmationNumber'),
    notes: optionalFormValue(formData, 'notes'),
    status: optionalFormValue(formData, 'status'),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string; serviceId: string }> },
) {
  const { id, dayId, serviceId } = await params;
  const formData = await request.formData();
  const intent = normalizeFormValue(formData.get('_method'));
  const method = intent === 'DELETE' ? 'DELETE' : 'PATCH';
  const payload = buildPayload(formData);
  const response = await fetch(`${API_BASE_URL}/bookings/${id}/days/${dayId}/services/${serviceId}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: method === 'DELETE' ? undefined : JSON.stringify(payload),
  });

  const referer = request.headers.get('referer');

  if (!response.ok) {
    if (response.status === 404) {
      const redirectUrl = new URL(referer || `/bookings/${id}?tab=operations`, request.url);
      redirectUrl.searchParams.set('tab', 'operations');
      redirectUrl.searchParams.delete('warning');
      redirectUrl.searchParams.delete('error');
      redirectUrl.searchParams.delete('success');
      redirectUrl.searchParams.set('warningText', 'This operation row was refreshed or is no longer available. Please reopen the row.');
      return NextResponse.redirect(redirectUrl, { status: 303 });
    }

    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: `/bookings/${id}?tab=operations`,
        genericError: method === 'DELETE' ? 'Failed to delete booking service.' : 'Failed to update booking service.',
      },
      response,
    );
  }

  let savedPayload: any = null;
  if (method !== 'DELETE') {
    savedPayload = await response.json().catch(() => null);
    const headers = {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    };
    const supplierId = payload.supplierId;
    const assignmentStatus = supplierId === null ? 'UNASSIGNED' : payload.assignmentStatus || (supplierId ? 'ASSIGNED' : undefined);
    if (supplierId !== undefined || payload.assignmentStatus !== undefined) {
      const assignmentResponse = await fetch(`${API_BASE_URL}/bookings/${id}/operations/${serviceId}/assign-supplier`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          supplierId: supplierId === undefined ? undefined : supplierId || null,
          assignmentStatus,
          assignmentNotes: payload.operationalNotes === undefined ? undefined : payload.operationalNotes || null,
        }),
        cache: 'no-store',
        redirect: 'manual',
      });
      if (!assignmentResponse.ok) {
        return buildProtectedActionErrorRedirect(
          {
            request,
            referer,
            fallbackPath: `/bookings/${id}?tab=operations`,
            genericError: 'Failed to save supplier assignment.',
          },
          assignmentResponse,
        );
      }
    }

    if (
      payload.supplierConfirmationStatus !== undefined ||
      payload.confirmationReference !== undefined ||
      payload.confirmationNotes !== undefined ||
      payload.confirmationNumber !== undefined
    ) {
      const confirmationResponse = await fetch(`${API_BASE_URL}/bookings/${id}/operations/${serviceId}/confirmation`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          supplierConfirmationStatus: payload.supplierConfirmationStatus || undefined,
          confirmationReference: payload.confirmationReference || payload.confirmationNumber || null,
          confirmationNotes: payload.confirmationNotes === undefined ? undefined : payload.confirmationNotes || null,
        }),
        cache: 'no-store',
        redirect: 'manual',
      });
      if (!confirmationResponse.ok) {
        return buildProtectedActionErrorRedirect(
          {
            request,
            referer,
            fallbackPath: `/bookings/${id}?tab=operations`,
            genericError: 'Failed to save supplier confirmation.',
          },
          confirmationResponse,
        );
      }
    }

  }

  const redirectUrl = new URL(referer || `/bookings/${id}?tab=operations`, request.url);
  redirectUrl.searchParams.set('tab', 'operations');
  redirectUrl.searchParams.delete('warning');
  redirectUrl.searchParams.delete('warningText');
  redirectUrl.searchParams.delete('error');
  redirectUrl.searchParams.delete('service');
  redirectUrl.searchParams.set('success', method === 'DELETE' ? 'Booking service deleted successfully.' : 'Booking service updated successfully.');
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
