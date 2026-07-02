/**
 * Booking Operations V2 — Phase 2F-A voucher send-preview flag (build-time, default OFF).
 *
 * When OFF, the "Send preview" affordance stays a disabled "Coming later" placeholder.
 * When ON, rows with an existing generated voucher get a READ-ONLY send-preview /
 * readiness panel that describes who a voucher email would go to (the assigned
 * operational supplier) and whether it is send-ready. It sends nothing, downloads
 * nothing, and mutates nothing — the actual send is a later phase.
 */
export function isOpsV2VoucherSendPreviewEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OPS_V2_VOUCHER_SEND_PREVIEW === 'true';
}
