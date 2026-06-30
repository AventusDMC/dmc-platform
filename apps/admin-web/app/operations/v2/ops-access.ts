/**
 * Booking Operations V2 — route-level role access.
 *
 * Single source of truth for who may access the V2 routes when the flag is ON.
 * Deliberately uses `hasRequiredRole` (NOT `canAccessOperations`, which omits
 * agent_admin) so route access exactly matches the Operations nav-group
 * visibility: admin, operations, super_admin, agent_admin.
 *
 * Pure module: no React, no I/O. The route guard reads the session role from
 * the cookie and passes it here.
 */
import { hasRequiredRole, type SessionRole } from '../../lib/auth-session';

/** Mirrors the Operations nav group's `roles`. Asserted in tests for parity. */
export const OPS_V2_ALLOWED_ROLES: SessionRole[] = ['admin', 'operations'];

export function isOpsV2Authorized(role: SessionRole | null | undefined): boolean {
  return hasRequiredRole(role, OPS_V2_ALLOWED_ROLES);
}
