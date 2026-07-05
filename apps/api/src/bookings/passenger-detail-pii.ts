import { DmcRole } from '../auth/auth.types';
import { shouldRedactPassengerPii } from '../auth/pii-roles';

/**
 * Booking-detail passenger PII (PR-3a).
 *
 * Pure transform for the passenger rows returned by the booking-detail API
 * (`GET /api/bookings/:id`). Kept React/Prisma-free so the masking + role-based
 * redaction is unit-testable in isolation.
 *
 * Behaviour:
 * - Everyone: the raw `passportNumber` is never returned; it is replaced by a
 *   last-4 masked `passportNumberMasked` (unchanged from prior behaviour).
 * - Restricted roles (see `shouldRedactPassengerPii`): every sensitive manifest
 *   field is additionally nulled, leaving only minimal operational identity
 *   (id, names, title, isLead, and any structural relations).
 *
 * Scope note: export gating (PR-3b) and audit-metadata safety (PR-3c) are
 * handled separately; this module only shapes the detail payload.
 */

/** Sensitive manifest fields nulled for restricted roles. */
export const REDACTED_PASSENGER_PII_FIELDS = [
  'passportNumberMasked',
  'passportIssueDate',
  'passportExpiryDate',
  'passportExpiry', // legacy alias present on some rows
  'dateOfBirth',
  'gender',
  'entryPoint',
  'visaStatus',
  'emergencyContactName',
  'emergencyContactPhone',
  'dietaryNotes',
  'roomingNotes',
  'arrivalFlight',
  'departureFlight',
  'nationality',
  'notes', // rendered as "Emergency Notes" in the manifest export
] as const;

/** Last-4 masking, e.g. `P1234567` -> `****4567`. Empty/blank -> null. */
export function maskPassportNumber(value?: string | null): string | null {
  const normalized = value?.trim() || '';
  if (!normalized) {
    return null;
  }
  const visible = normalized.slice(-4);
  return `${'*'.repeat(Math.max(0, normalized.length - 4))}${visible}`;
}

/**
 * Shape a raw passenger row for the booking-detail payload, redacting sensitive
 * fields when the actor role is restricted. Non-destructive: returns a new
 * object, leaves the input untouched.
 */
export function mapPassengerForDetail(passenger: any, role?: DmcRole | null) {
  const base = {
    ...passenger,
    passportNumberMasked: maskPassportNumber(passenger?.passportNumber),
    passportNumber: undefined,
  };

  if (!shouldRedactPassengerPii(role)) {
    return base;
  }

  const redacted: Record<string, unknown> = { ...base };
  for (const field of REDACTED_PASSENGER_PII_FIELDS) {
    redacted[field] = null;
  }
  return redacted;
}
