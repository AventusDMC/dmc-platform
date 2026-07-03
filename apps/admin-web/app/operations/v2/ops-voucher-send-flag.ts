/**
 * Booking Operations V2 — Phase 2F-B voucher SEND flag (build-time, default OFF).
 *
 * When OFF, the "Send" affordance stays a disabled "Coming later" placeholder.
 * When ON, rows with a generated voucher get a Send control that first fetches the
 * 2F-A readiness preview and, only when readiness is READY, allows an ACTUAL email
 * send (typed-SEND confirmation required). The backend flag OPS_V2_VOUCHER_SEND_ENABLED
 * is an independent kill-switch — the endpoint sends nothing when it is OFF even if
 * this flag is accidentally ON.
 */
export function isOpsV2VoucherSendEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OPS_V2_VOUCHER_SEND === 'true';
}
