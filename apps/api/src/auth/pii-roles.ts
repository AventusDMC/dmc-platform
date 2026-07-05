import { DmcRole } from './auth.types';

/**
 * Roles permitted to receive full passenger PII (passport, DOB, emergency
 * contact, visa status, flights, nationality, etc.).
 *
 * Single source of truth so the booking-detail passenger mapper (PR-3a) and the
 * manifest export gate (PR-3b) agree on who is "internal ops". Everyone else —
 * including `agent_admin` (external / agency-facing) as well as `agent`,
 * `viewer`, and `finance` — is treated as restricted and receives a redacted
 * passenger record.
 *
 * Deliberately NOT wired into the global `roles.guard.ts` coalescing (which lets
 * `agent_admin` satisfy `@Roles('admin')`). PII protection is an additive,
 * explicit check at each data-exposure point.
 */
export const PII_FULL_ROLES: readonly DmcRole[] = ['admin', 'operations', 'super_admin'];

/** True only for a known full-PII role. */
export function isFullPiiRole(role?: DmcRole | null): boolean {
  return role != null && PII_FULL_ROLES.includes(role);
}

/**
 * Redact passenger PII only for a KNOWN restricted role.
 *
 * A missing role denotes an internal / server-side caller (voucher + manifest
 * generation, recalculation) that must keep full data. Every external HTTP
 * request carries the authenticated actor's role, so a restricted user is always
 * redacted — there is no gap from treating "no role" as full.
 */
export function shouldRedactPassengerPii(role?: DmcRole | null): boolean {
  return role != null && !isFullPiiRole(role);
}
