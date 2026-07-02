/**
 * Booking Operations V2 — Phase 2D voucher-preview flag (build-time, default OFF).
 *
 * When OFF, the "Preview" affordance stays a disabled "Coming later" placeholder.
 * When ON, rows with an existing previewable voucher get a read-only preview
 * panel (no send, download, print, export, or PDF).
 */
export function isOpsV2VoucherPreviewEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OPS_V2_VOUCHER_PREVIEW === 'true';
}
