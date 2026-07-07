import type { SessionRole } from '../../lib/auth-session';

/**
 * Product Catalog V2 — internal-first route access (Slice 3).
 *
 * First production debut is limited to INTERNAL roles only. EXPLICIT allowlist
 * (a plain `includes`) — deliberately NOT `hasRequiredRole`, which coalesces
 * `agent_admin`→`admin` and would let it through. `super_admin` is listed
 * explicitly; `agent` / `viewer` / `agent_admin` are blocked. Mirrors the backend
 * `catalog-v2-access.ts`.
 */
export const CATALOG_V2_ALLOWED_ROLES: SessionRole[] = ['admin', 'operations', 'super_admin', 'finance'];

export function isCatalogV2Authorized(role: SessionRole | null | undefined): boolean {
  return role != null && CATALOG_V2_ALLOWED_ROLES.includes(role);
}
