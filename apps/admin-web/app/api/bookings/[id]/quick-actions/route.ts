import { NextRequest, NextResponse } from 'next/server';
import { buildActorHeaders } from '../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type QuickActionService = {
  id: string;
  label: string;
  status: 'pending' | 'ready' | 'in_progress' | 'confirmed' | 'cancelled';
  confirmationStatus: 'pending' | 'requested' | 'confirmed';
  supplierReference: string | null;
  reconfirmationRequired: boolean;
  reconfirmationDueAt: string | null;
  serviceDate: string | null;
  startTime: string | null;
  pickupTime: string | null;
  pickupLocation: string | null;
  meetingPoint: string | null;
  participantCount: number | null;
  adultCount: number | null;
  childCount: number | null;
};

type QuickActionDetail = {
  serviceId: string;
  label: string;
  reason: string;
};

type QuickActionResult = {
  successCount: number;
  failedCount: number;
  skippedCount: number;
  errors?: string[];
  failures?: QuickActionDetail[];
  skipped?: QuickActionDetail[];
};

function isReconfirmationDue(service: QuickActionService) {
  if (!service.reconfirmationRequired || !service.reconfirmationDueAt || service.status === 'cancelled') {
    return false;
  }

  const dueAt = new Date(service.reconfirmationDueAt).getTime();
  return !Number.isNaN(dueAt) && dueAt <= Date.now();
}

async function patchJson(request: NextRequest, url: string, body: unknown) {
  console.log('FETCH URL:', url);
  return fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify(body),
  });
}

function readErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const candidate =
      'message' in payload
        ? payload.message
        : 'error' in payload
          ? payload.error
          : null;

    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return fallback;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | {
        action?: 'confirm' | 'reconfirm' | 'mark_paid';
        finance?: {
          clientInvoiceStatus?: 'unbilled' | 'invoiced' | 'paid';
          supplierPaymentStatus?: 'unpaid' | 'scheduled' | 'paid';
        };
        services?: QuickActionService[];
        nextReconfirmationDueAt?: string;
      }
    | null;

  const action = body?.action;
  const services = Array.isArray(body?.services) ? body?.services : [];

  if (!action) {
    return NextResponse.json({ error: 'Missing quick action.' }, { status: 400 });
  }

  if (action === 'mark_paid') {
    if (body?.finance?.clientInvoiceStatus === 'paid') {
      return NextResponse.json<QuickActionResult>({
        successCount: 0,
        failedCount: 0,
        skippedCount: 1,
        skipped: [
          {
            serviceId: id,
            label: 'Client invoice',
            reason: 'already paid',
          },
        ],
      });
    }

    const response = await patchJson(request, `${API_BASE_URL}/bookings/${id}/finance`, {
      clientInvoiceStatus: 'paid',
      supplierPaymentStatus: body?.finance?.supplierPaymentStatus || 'unpaid',
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      return NextResponse.json<QuickActionResult>({
        successCount: 0,
        failedCount: 1,
        skippedCount: 0,
        errors: [readErrorMessage(payload, 'Failed to update booking finance statuses.')],
        failures: [
          {
            serviceId: id,
            label: 'Client invoice',
            reason: readErrorMessage(payload, 'Failed to update booking finance statuses.'),
          },
        ],
      });
    }

    return NextResponse.json<QuickActionResult>({
      successCount: 1,
      failedCount: 0,
      skippedCount: 0,
    });
  }

  if (action === 'confirm') {
    const result: QuickActionResult = {
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      errors: [],
      failures: [],
      skipped: [],
    };

    for (const service of services) {
      if (service.status === 'cancelled') {
        result.skippedCount += 1;
        result.skipped?.push({
          serviceId: service.id,
          label: service.label,
          reason: 'cancelled',
        });
        continue;
      }

      if (service.confirmationStatus === 'confirmed') {
        result.skippedCount += 1;
        result.skipped?.push({
          serviceId: service.id,
          label: service.label,
          reason: 'already confirmed',
        });
        continue;
      }

      const response = await patchJson(request, `${API_BASE_URL}/bookings/services/${service.id}/confirmation`, {
        confirmationStatus: 'confirmed',
        confirmationNumber: service.supplierReference || null,
        supplierReference: service.supplierReference || null,
        notes: 'Confirmed from booking queue quick action.',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const reason = readErrorMessage(payload, `Failed to confirm service ${service.id}.`);
        result.failedCount += 1;
        result.errors?.push(reason);
        result.failures?.push({
          serviceId: service.id,
          label: service.label,
          reason,
        });
        continue;
      }

      result.successCount += 1;
    }

    return NextResponse.json<QuickActionResult>({
      ...result,
      errors: result.errors && result.errors.length > 0 ? result.errors : undefined,
      failures: result.failures && result.failures.length > 0 ? result.failures : undefined,
      skipped: result.skipped && result.skipped.length > 0 ? result.skipped : undefined,
    });
  }

  const nextReconfirmationDueAt = body?.nextReconfirmationDueAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const result: QuickActionResult = {
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    errors: [],
    failures: [],
    skipped: [],
  };

  for (const service of services) {
    if (!isReconfirmationDue(service)) {
      result.skippedCount += 1;
      result.skipped?.push({
        serviceId: service.id,
        label: service.label,
        reason: service.status === 'cancelled' ? 'cancelled' : 'reconfirmation not due',
      });
      continue;
    }

    if (service.confirmationStatus !== 'confirmed') {
      const confirmationResponse = await patchJson(request, `${API_BASE_URL}/bookings/services/${service.id}/confirmation`, {
        confirmationStatus: 'requested',
        confirmationNumber: service.supplierReference || null,
        supplierReference: service.supplierReference || null,
        notes: 'Reconfirmation requested from booking queue quick action.',
      });

      if (!confirmationResponse.ok) {
        const payload = await confirmationResponse.json().catch(() => null);
        const reason = readErrorMessage(payload, `Failed to request reconfirmation for service ${service.id}.`);
        result.failedCount += 1;
        result.errors?.push(reason);
        result.failures?.push({
          serviceId: service.id,
          label: service.label,
          reason,
        });
        continue;
      }
    }

    const operationalResponse = await patchJson(request, `${API_BASE_URL}/bookings/services/${service.id}/operational`, {
      serviceDate: service.serviceDate,
      startTime: service.startTime,
      pickupTime: service.pickupTime,
      pickupLocation: service.pickupLocation,
      meetingPoint: service.meetingPoint,
      participantCount: service.participantCount,
      adultCount: service.adultCount,
      childCount: service.childCount,
      supplierReference: service.supplierReference || null,
      reconfirmationRequired: true,
      reconfirmationDueAt: nextReconfirmationDueAt,
      note: 'Reconfirmation follow-up recorded from booking queue quick action.',
    });

    if (!operationalResponse.ok) {
      const payload = await operationalResponse.json().catch(() => null);
      const reason = readErrorMessage(payload, `Failed to update reconfirmation timing for service ${service.id}.`);
      result.failedCount += 1;
      result.errors?.push(reason);
      result.failures?.push({
        serviceId: service.id,
        label: service.label,
        reason,
      });
      continue;
    }

    result.successCount += 1;
  }

  return NextResponse.json<QuickActionResult>({
    ...result,
    errors: result.errors && result.errors.length > 0 ? result.errors : undefined,
    failures: result.failures && result.failures.length > 0 ? result.failures : undefined,
    skipped: result.skipped && result.skipped.length > 0 ? result.skipped : undefined,
  });
}
