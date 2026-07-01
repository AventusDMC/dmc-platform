/**
 * Booking Operations V2 — Phase 2B manual supplier confirmation status flag.
 *
 * Build-time, default OFF. When OFF, the operations rows keep the existing
 * disabled "Request confirmation — Coming later" placeholder. When ON, allowed
 * roles get the inline control to RECORD supplier confirmation status manually
 * (Confirmed / Rejected / Not Sent) — no emails, no request-send. Layered UNDER
 * the route flag (NEXT_PUBLIC_OPS_V2_DEFAULT) and the route-level role gate.
 *
 * There is no backend flag: the confirmation-status endpoint already exists and
 * is role-gated identically to the V2 routes, and it sends no email.
 */
export function isOpsV2SupplierConfirmEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OPS_V2_SUPPLIER_CONFIRM_STATUS === 'true';
}
