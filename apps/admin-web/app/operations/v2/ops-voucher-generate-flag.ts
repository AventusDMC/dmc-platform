/**
 * Booking Operations V2 — Phase 2C voucher-generate flag (build-time, default OFF).
 *
 * When OFF, the operations board keeps the disabled "Generate voucher — Coming
 * later" placeholder. When ON, eligible service rows get the gated
 * generate-voucher-RECORD control (no send, download, preview, print, or export).
 */
export function isOpsV2VoucherGenerateEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OPS_V2_VOUCHER_GENERATE === 'true';
}
