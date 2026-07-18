import { DmcRole } from './auth.types';

/**
 * Roles permitted to see internal cost / margin figures in the Quote Builder V2
 * surfaces (Slice 2C). Mirrors the admin-web `canAccessFinance` predicate used by
 * the UI gating (PR #766) and hydration redaction (PR #767): admin / super_admin /
 * finance only.
 *
 * Deliberately NARROWER than PII_FULL_ROLES (which includes `operations`):
 * operations can preview/apply pricing and add items, but must NOT receive cost /
 * margin — they see the client-facing SELLING price only. agent / viewer /
 * agent_admin never see cost.
 *
 * Additive, explicit check at each cost-exposure point — NOT wired into the global
 * roles guard coalescing (which lets `agent_admin` satisfy `@Roles('admin')`).
 */
export const QUOTE_COST_VISIBLE_ROLES: readonly DmcRole[] = ['admin', 'super_admin', 'finance'];

/** True only for a role permitted to receive quote cost / margin figures. */
export function canViewQuoteCostMargin(role?: DmcRole | string | null): boolean {
  return role != null && (QUOTE_COST_VISIBLE_ROLES as readonly string[]).includes(role);
}
