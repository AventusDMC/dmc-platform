/**
 * Booking Operations V2 — rooming mutation request builders (pure, PR-2c-1).
 *
 * React/Next-free so endpoint/method/body are unit-testable and the field
 * allowlist lives in one place. Targets the NEW V2 JSON proxies under
 * /api/bookings/:id/v2/rooming — the Classic form-post/redirect proxies are
 * left untouched.
 *
 * PR-2c-1 scope = room CRUD ONLY (create / update / delete). Passenger
 * assignment, unassignment, and auto-assign are PR-2c-2.
 */

export const ROOM_OCCUPANCIES = ['single', 'double', 'triple', 'quad', 'unknown'] as const;
export type RoomOccupancyValue = (typeof ROOM_OCCUPANCIES)[number];

export const ALLOWED_ROOM_FIELDS = ['roomType', 'occupancy', 'notes', 'sortOrder'] as const;

export type RoomEditableFields = {
  roomType?: string | null;
  occupancy?: RoomOccupancyValue;
  notes?: string | null;
  sortOrder?: number;
};

export function normalizeRoomOccupancy(value: unknown): RoomOccupancyValue | undefined {
  const v = String(value ?? '').trim().toLowerCase();
  return (ROOM_OCCUPANCIES as readonly string[]).includes(v) ? (v as RoomOccupancyValue) : undefined;
}

/**
 * Keep ONLY the allowlisted room fields; occupancy is validated against the enum
 * (an unknown value is dropped). Empty strings normalize to null.
 */
export function pickAllowedRoomFields(input: Record<string, unknown>): RoomEditableFields {
  const out: RoomEditableFields = {};
  if (input.roomType !== undefined) {
    const t = input.roomType === null ? null : String(input.roomType).trim();
    out.roomType = t === '' ? null : t;
  }
  if (input.occupancy !== undefined) {
    const occ = normalizeRoomOccupancy(input.occupancy);
    if (occ) out.occupancy = occ;
  }
  if (input.notes !== undefined) {
    const n = input.notes === null ? null : String(input.notes).trim();
    out.notes = n === '' ? null : n;
  }
  if (input.sortOrder !== undefined && input.sortOrder !== null && input.sortOrder !== '') {
    const n = Number(input.sortOrder);
    if (Number.isFinite(n)) out.sortOrder = n;
  }
  return out;
}

export function roomingBasePath(bookingId: string): string {
  return `/api/bookings/${bookingId}/v2/rooming`;
}

export type RoomMutationRequest = {
  url: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body?: RoomEditableFields;
};

export function buildRoomCreateRequest(bookingId: string, fields: Record<string, unknown>): RoomMutationRequest {
  return { url: roomingBasePath(bookingId), method: 'POST', body: pickAllowedRoomFields(fields) };
}

export function buildRoomUpdateRequest(
  bookingId: string,
  roomingEntryId: string,
  fields: Record<string, unknown>,
): RoomMutationRequest {
  return {
    url: `${roomingBasePath(bookingId)}/${roomingEntryId}`,
    method: 'PATCH',
    body: pickAllowedRoomFields(fields),
  };
}

export function buildRoomDeleteRequest(bookingId: string, roomingEntryId: string): RoomMutationRequest {
  return { url: `${roomingBasePath(bookingId)}/${roomingEntryId}`, method: 'DELETE' };
}

/** Pull a human-readable error message out of a mutation response body. */
export function resolveRoomingErrorMessage(body: unknown, fallback = 'Could not save rooming changes.'): string {
  if (body && typeof body === 'object') {
    const message = (body as { message?: unknown }).message;
    if (Array.isArray(message) && message.length > 0) return String(message[0]);
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}
