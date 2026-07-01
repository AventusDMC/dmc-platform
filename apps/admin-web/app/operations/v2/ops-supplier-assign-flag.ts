/**
 * Booking Operations V2 — Phase 2A supplier-assignment feature flag.
 *
 * Build-time, default OFF. When OFF, the operations rows keep the existing
 * disabled "Assign supplier — Coming later" placeholder and the V2 surface stays
 * fully read-only. When ON, allowed roles get the inline supplier-assignment
 * control (the ONLY mutation in V2 Phase 2A). This flag is layered UNDER the
 * route flag (NEXT_PUBLIC_OPS_V2_DEFAULT) and the route-level role gate — both
 * still apply.
 *
 * There is no backend flag: the supplier-assignment endpoint already exists and
 * is role-gated identically to the V2 routes.
 */
export function isOpsV2SupplierAssignEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OPS_V2_SUPPLIER_ASSIGN === 'true';
}
