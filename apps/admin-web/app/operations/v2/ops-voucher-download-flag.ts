/**
 * Booking Operations V2 — Phase 2E voucher-download flag (build-time, default OFF).
 *
 * When OFF, the "Download" affordance stays a disabled "Coming later" placeholder.
 * When ON, rows with an existing downloadable voucher get a read-only PDF
 * download (no send, email, print, export, or status change).
 */
export function isOpsV2VoucherDownloadEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OPS_V2_VOUCHER_DOWNLOAD === 'true';
}
