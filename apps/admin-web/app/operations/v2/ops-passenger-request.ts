/**
 * Booking Operations V2 — passenger mutation request builders (pure, PR-2b).
 *
 * React/Next-free so the exact endpoint, method, and body are unit-testable and
 * the field allowlist lives in one place. Targets the NEW V2 JSON proxies under
 * /api/bookings/:id/v2/passengers — the Classic form-post/redirect proxies are
 * left untouched.
 *
 * PII GUARDRAIL: only the non-PII editable fields below are ever forwarded.
 * passportNumber, passportIssueDate, passportExpiryDate, dateOfBirth, gender,
 * entryPoint, visaStatus, and emergency contacts are DELIBERATELY excluded from
 * create/update — V2 must not set or expose PII until PR-3. `isLead` is excluded
 * from create/update too; the lead is changed only via the dedicated set-lead
 * request.
 */

export const ALLOWED_PASSENGER_FIELDS = [
  'firstName',
  'lastName',
  'title',
  'nationality',
  'arrivalFlight',
  'departureFlight',
  'dietaryNotes',
  'roomingNotes',
] as const;

export type PassengerEditableField = (typeof ALLOWED_PASSENGER_FIELDS)[number];
export type PassengerEditableFields = Partial<Record<PassengerEditableField, string | null>>;

/**
 * Keep ONLY the allowlisted fields — strips any PII field or `isLead` that a
 * caller (or a hostile client) might include. Empty strings normalize to null.
 */
export function pickAllowedPassengerFields(input: Record<string, unknown>): PassengerEditableFields {
  const out: PassengerEditableFields = {};
  for (const key of ALLOWED_PASSENGER_FIELDS) {
    if (input[key] === undefined) continue;
    const value = input[key];
    if (value === null) {
      out[key] = null;
    } else {
      const text = String(value).trim();
      out[key] = text === '' ? null : text;
    }
  }
  return out;
}

export function passengersBasePath(bookingId: string): string {
  return `/api/bookings/${bookingId}/v2/passengers`;
}

export type PassengerMutationRequest = {
  url: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body?: PassengerEditableFields;
};

export function buildPassengerCreateRequest(
  bookingId: string,
  fields: Record<string, unknown>,
): PassengerMutationRequest {
  return { url: passengersBasePath(bookingId), method: 'POST', body: pickAllowedPassengerFields(fields) };
}

export function buildPassengerUpdateRequest(
  bookingId: string,
  passengerId: string,
  fields: Record<string, unknown>,
): PassengerMutationRequest {
  return {
    url: `${passengersBasePath(bookingId)}/${passengerId}`,
    method: 'PATCH',
    body: pickAllowedPassengerFields(fields),
  };
}

export function buildPassengerDeleteRequest(bookingId: string, passengerId: string): PassengerMutationRequest {
  return { url: `${passengersBasePath(bookingId)}/${passengerId}`, method: 'DELETE' };
}

export function buildSetLeadRequest(bookingId: string, passengerId: string): PassengerMutationRequest {
  return { url: `${passengersBasePath(bookingId)}/${passengerId}/set-lead`, method: 'POST' };
}

/** Pull a human-readable error message out of a mutation response body. */
export function resolvePassengerErrorMessage(
  body: unknown,
  fallback = 'Could not save passenger changes.',
): string {
  if (body && typeof body === 'object') {
    const message = (body as { message?: unknown }).message;
    if (Array.isArray(message) && message.length > 0) return String(message[0]);
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}
