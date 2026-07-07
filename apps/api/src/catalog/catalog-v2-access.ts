import type { DmcRole } from '../auth/auth.types';

/**
 * Product Catalog V2 — internal-first role gate (Slice 3).
 *
 * The first production debut is limited to INTERNAL roles only. This is an
 * EXPLICIT allowlist (a plain `includes`), NOT the coalescing `roles.guard`
 * check — so `agent_admin` (which the guard coalesces to `admin`) is BLOCKED
 * here, and `super_admin` is listed explicitly. Pricing redaction in the builder
 * is retained for a future widen-out to external roles, but the endpoint blocks
 * excluded roles for this debut.
 */
export const CATALOG_V2_ALLOWED_ROLES: readonly DmcRole[] = ['admin', 'operations', 'super_admin', 'finance'];

export function isCatalogV2Authorized(role: DmcRole | null | undefined): boolean {
  return role != null && CATALOG_V2_ALLOWED_ROLES.includes(role);
}
