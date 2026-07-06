/**
 * Product Catalog V2 — build-time route opt-in flag.
 *
 * Default OFF: when unset/!= 'true', the /catalog/v2 route 404s (hidden) and the
 * feature is invisible. This gates ONLY route reachability; the read-only page
 * consumes the existing backend GET /catalog/v2/summary, which independently
 * fail-closes on CATALOG_V2_ENABLED and enforces role-based pricing redaction.
 */
export function isCatalogV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_CATALOG_V2 === 'true';
}
