/**
 * Booking Operations V2 — Phase 2C voucher-generate request (pure).
 *
 * The single sanctioned mutation added in V2 Phase 2C: GENERATE a voucher RECORD
 * for one operations row. Kept as a pure, React/Next-free module so the exact
 * endpoint, method, and body can be unit-tested and so the read-only invariant
 * can allowlist exactly this surface.
 *
 * Scope guardrails baked in:
 *  - method is ALWAYS PATCH, to the V2 voucher-generate proxy only (which
 *    forwards to the backend generate endpoint — record only).
 *  - body is EMPTY: no free-text and no ref codes. It never sends, downloads,
 *    previews, prints, exports, or changes voucher status.
 */
export function voucherGeneratePath(bookingId: string, operationId: string): string {
  return `/api/bookings/${bookingId}/operations/${operationId}/voucher/generate`;
}

export type VoucherGenerateRequest = {
  url: string;
  method: 'PATCH';
  /** Intentionally empty — the smallest safe action is "generate the record". */
  body: Record<string, never>;
};

/** Build the request to generate one operations row's voucher record. */
export function buildVoucherGenerateRequest(
  bookingId: string,
  operationId: string,
): VoucherGenerateRequest {
  return {
    url: voucherGeneratePath(bookingId, operationId),
    method: 'PATCH',
    body: {},
  };
}
