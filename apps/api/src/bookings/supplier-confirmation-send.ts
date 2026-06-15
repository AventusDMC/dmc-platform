// Phase O.2B-2C — PURE decision logic for the gated supplier-confirmation SEND.
//
// Given a supplier-confirmation PREVIEW (built by the O.2B-1/-2B read-only builder)
// and a send scope { supplierId }, decide whether a send is allowed and, if so,
// what the server should transmit. It NEVER accepts an arbitrary email/subject/body
// — recipient + content come ONLY from the preview draft (which resolves the
// recipient server-side via assignedSupplierId ?? supplierId → Supplier.email and
// strips all cost/markup). No IO, no Prisma, no Nest, no mail.

import type { SupplierConfirmationPreview } from './supplier-confirmation-preview';

export type SupplierConfirmationSendScope = {
  supplierId: string;
  serviceId?: string | null;
};

export type SupplierConfirmationSendPlan =
  | { ok: false; code: 'NOT_FOUND' | 'NO_SUPPLIER' | 'MISSING_EMAIL' | 'NO_SERVICES'; reason: string }
  | {
      ok: true;
      supplierId: string;
      recipientEmail: string;
      recipientName: string;
      subject: string;
      body: string;
      serviceIds: string[];
      statusTransition: 'REQUESTED';
    };

/**
 * Decide the gated-send plan from a preview + scope. Pure + deterministic.
 * The caller MUST still (a) re-check service-level state (cancelled/already
 * confirmed) against live rows and (b) only mutate status/audit AFTER a successful
 * email send — this function only authorizes recipient + content.
 */
export function planSupplierConfirmationSend(
  preview: SupplierConfirmationPreview,
  scope: SupplierConfirmationSendScope,
): SupplierConfirmationSendPlan {
  const supplierId = String(scope?.supplierId || '').trim();
  if (!supplierId) {
    return { ok: false, code: 'NOT_FOUND', reason: 'A supplierId is required to send a confirmation.' };
  }

  // Match the draft whose RESOLVED recipient (assigned ?? linked) is this supplier,
  // or whose group supplierId is this supplier. Never match by name.
  const draft = (preview.suppliers || []).find(
    (d) => d.recipient?.supplierId === supplierId || d.supplierId === supplierId,
  );
  if (!draft) {
    return { ok: false, code: 'NOT_FOUND', reason: 'No matching supplier draft for this booking.' };
  }

  if (draft.readiness === 'NO_SUPPLIER') {
    return { ok: false, code: 'NO_SUPPLIER', reason: draft.readinessReason || 'Assign a supplier first.' };
  }
  if (draft.readiness === 'NO_SERVICES') {
    return { ok: false, code: 'NO_SERVICES', reason: draft.readinessReason || 'No services found for this supplier.' };
  }
  if (draft.readiness === 'MISSING_EMAIL' || !draft.recipient?.email) {
    return { ok: false, code: 'MISSING_EMAIL', reason: draft.readinessReason || 'Supplier email missing.' };
  }
  if (draft.readiness !== 'READY' || !draft.recipient.supplierId) {
    return { ok: false, code: 'NO_SUPPLIER', reason: draft.readinessReason || 'Supplier is not ready for confirmation.' };
  }

  const serviceIds = (draft.services || []).map((s) => s.serviceId).filter(Boolean);
  if (serviceIds.length === 0) {
    return { ok: false, code: 'NO_SERVICES', reason: 'No services found for this supplier.' };
  }

  return {
    ok: true,
    supplierId: draft.recipient.supplierId,
    recipientEmail: draft.recipient.email,
    recipientName: draft.recipient.supplierName,
    subject: draft.subject,
    body: draft.body,
    serviceIds,
    statusTransition: 'REQUESTED',
  };
}
