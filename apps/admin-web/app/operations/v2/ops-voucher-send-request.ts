/**
 * Booking Operations V2 — Phase 2F-B pure voucher SEND request builder.
 *
 * The sanctioned mutation for actual sending: a POST to the voucher-send proxy with
 * an EMPTY body. The client sends NO recipient, subject, body, or attachment — the
 * server re-resolves the recipient from the assigned operational supplier, re-runs
 * readiness, generates the finance-free PDF, and sends via Resend. This builder is
 * allowlisted by the read-only invariant (VOUCHER_SEND_ALLOWLIST).
 */
export function voucherSendPath(bookingId: string, operationId: string): string {
  return `/api/operations/v2/${bookingId}/${operationId}/voucher-send`;
}

export type VoucherSendRequest = {
  url: string;
  method: 'POST';
  body: string;
};

export function buildVoucherSendRequest(bookingId: string, operationId: string): VoucherSendRequest {
  return {
    url: voucherSendPath(bookingId, operationId),
    method: 'POST',
    // Empty body — NO recipient/subject/body/attachment is ever sent by the client.
    body: '{}',
  };
}
