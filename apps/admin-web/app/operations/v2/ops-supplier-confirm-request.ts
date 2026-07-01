/**
 * Booking Operations V2 — Phase 2B manual supplier confirmation request (pure).
 *
 * The single sanctioned mutation added in V2 Phase 2B: manually RECORD the
 * supplier confirmation OUTCOME. Kept as a pure, React/Next-free module so the
 * exact endpoint, method, and body can be unit-tested and so the read-only
 * invariant can allowlist exactly this surface.
 *
 * Scope guardrails baked in:
 *  - method is ALWAYS PATCH, to the confirmation endpoint only.
 *  - status is ONLY 'CONFIRMED' | 'REJECTED'. The email-implying statuses and a
 *    reset-to-not-sent are intentionally absent — a reset does not fully clear
 *    the downstream operational state, so it is not a safe undo for this cut.
 *  - body carries ONLY supplierConfirmationStatus: no reference, no notes.
 */
export const SUPPLIER_CONFIRM_STATUS = {
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
} as const;

export type SupplierConfirmStatus = (typeof SUPPLIER_CONFIRM_STATUS)[keyof typeof SUPPLIER_CONFIRM_STATUS];

/** The exact, ordered set of outcomes this phase may record. */
export const SUPPLIER_CONFIRM_STATUSES: SupplierConfirmStatus[] = [
  SUPPLIER_CONFIRM_STATUS.CONFIRMED,
  SUPPLIER_CONFIRM_STATUS.REJECTED,
];

export function isSupplierConfirmStatus(value: unknown): value is SupplierConfirmStatus {
  return typeof value === 'string' && (SUPPLIER_CONFIRM_STATUSES as string[]).includes(value);
}

/**
 * UI rule: recording an outcome requires an assigned supplier. Both Phase 2B
 * statuses (Confirmed / Rejected) are outcomes, so both are disabled until a
 * supplier is assigned. (The backend additionally 400s on CONFIRMED without a
 * supplier.)
 */
export function requiresAssignedSupplier(status: SupplierConfirmStatus): boolean {
  return status === SUPPLIER_CONFIRM_STATUS.CONFIRMED || status === SUPPLIER_CONFIRM_STATUS.REJECTED;
}

export function supplierConfirmPath(bookingId: string, operationId: string): string {
  return `/api/bookings/${bookingId}/operations/${operationId}/confirmation`;
}

export type SupplierConfirmRequest = {
  url: string;
  method: 'PATCH';
  body: { supplierConfirmationStatus: SupplierConfirmStatus };
};

/** Build the request to record one operations row's confirmation outcome. */
export function buildSupplierConfirmRequest(
  bookingId: string,
  operationId: string,
  status: SupplierConfirmStatus,
): SupplierConfirmRequest {
  return {
    url: supplierConfirmPath(bookingId, operationId),
    method: 'PATCH',
    body: { supplierConfirmationStatus: status },
  };
}
