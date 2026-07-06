// Supplier Voucher Packet V2 — S3 backend feature flag.
// DEFAULT OFF, FAIL-CLOSED. The backend flag is the independent gate for packet
// GENERATION: when OFF (absent / empty / anything but the exact string "true"),
// the generate endpoint writes NOTHING and returns feature_disabled — regardless
// of the frontend flag. Because code auto-deploys to production, this flag is the
// real prod safety: prod receives the code on merge but cannot write packets
// until this is explicitly set to "true" on the production API.

export function isOpsV2VoucherPacketEnabled(): boolean {
  return String(process.env.OPS_V2_VOUCHER_PACKET_ENABLED ?? '').trim() === 'true';
}
