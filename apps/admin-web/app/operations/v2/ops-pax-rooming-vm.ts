/**
 * Booking Operations V2 — Passengers & Rooming view model (pure mapping).
 *
 * The ONLY place raw booking-detail data becomes pax/rooming props. It copies a
 * small ALLOWLIST of display-safe identity fields — it never carries cost,
 * sell, payable, margin, invoice, payment, or supplier-financial fields (those
 * are not on passengers/rooming anyway; the allowlist guarantees it). Passport
 * is read from the API's already-masked `passportNumberMasked`.
 *
 * Room validity is a VERBATIM PORT of the Classic rooming tab
 * (apps/admin-web/app/bookings/[id]/page.tsx):
 *   - normalizeRoomingCode ......... lines 800-802
 *   - getRoomOccupancyCapacity ..... lines 820-852
 *   - validity (capacity vs count) . lines 2855-2858
 * Pinning tests (ops-pax-rooming-vm.test.ts) lock these to Classic semantics.
 *
 * Pure module: no React, no I/O.
 */
import type { RawAuditLog } from './ops-activity-vm';
import type { RawFinanceSummary, RawPayment } from './ops-finance-vm';
import type { RawDocService } from './ops-documents-vm';

export type RoomOccupancy = 'single' | 'double' | 'triple' | 'quad' | 'unknown';

export type RawPassenger = {
  id: string;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  nationality?: string | null;
  passportNumberMasked?: string | null;
  passportExpiryDate?: string | null;
  arrivalFlight?: string | null;
  departureFlight?: string | null;
  dietaryNotes?: string | null;
  roomingNotes?: string | null;
  isLead?: boolean | null;
};

export type RawRoomingEntry = {
  id: string;
  roomType?: string | null;
  occupancy?: RoomOccupancy | null;
  notes?: string | null;
  sortOrder?: number | null;
  assignments?: Array<{
    id?: string;
    bookingPassenger?: { id?: string; firstName?: string | null; lastName?: string | null; title?: string | null; isLead?: boolean | null } | null;
  }> | null;
};

export type RawBookingDetail = {
  status?: string | null;
  bookingRef?: string | null;
  // Pax + room counts and travel window — advisory readiness inputs (PR-1).
  // Already present on the /bookings/:id response; used only to compute
  // read-only warnings (never mutated, never priced).
  adults?: number | null;
  children?: number | null;
  roomCount?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  passengers?: RawPassenger[] | null;
  roomingEntries?: RawRoomingEntry[] | null;
  /** Present on the booking-detail response; consumed by the Activity VM. */
  auditLogs?: RawAuditLog[] | null;
  /** Internal finance summary + payments; consumed by the Finance VM. */
  finance?: RawFinanceSummary;
  payments?: RawPayment[] | null;
  /** Services carry nested vouchers; consumed by the Documents VM. */
  services?: RawDocService[] | null;
} | null
  | undefined;

export type RoomValidity = 'Valid' | 'Mismatch' | 'Needs occupancy' | 'Assigned';

export type PaxRowVM = {
  id: string;
  name: string;
  isLead: boolean;
  nationality: string | null;
  passportMasked: string | null;
  passportExpiry: string | null;
  arrivalFlight: string | null;
  departureFlight: string | null;
  dietaryNotes: string | null;
  roomingNotes: string | null;
  // Advisory passport flags (PR-1). Derived from the already-masked passport +
  // expiry already shown in this tab — no new PII is introduced.
  missingPassport: boolean;
  passportExpiring: boolean;
  passportExpiryDaysToTravel: number | null;
};

export type RoomRowVM = {
  id: string;
  label: string;
  occupancy: RoomOccupancy;
  capacity: number | null;
  assignedNames: string[];
  notes: string | null;
  validity: RoomValidity;
};

// --- Advisory readiness (PR-1) ---------------------------------------------
// All warnings are advisory only (level 'warning') — they NEVER block any
// action. Computed purely from booking counts + already-displayed pax/rooming
// data. No finance/pricing, no mutation.

export type PaxRoomingWarningCode =
  | 'room-count-vs-pax'
  | 'rooms-vs-roomCount'
  | 'unassigned-passengers'
  | 'empty-rooms'
  | 'missing-passport'
  | 'passport-expiry';

export type PaxRoomingWarning = {
  code: PaxRoomingWarningCode;
  level: 'warning';
  count: number;
  message: string;
};

export type PaxRoomingReadiness = {
  warnings: PaxRoomingWarning[];
  isReady: boolean;
};

export type PaxRoomingVM = {
  passengers: PaxRowVM[];
  rooms: RoomRowVM[];
  hasPassengers: boolean;
  hasRooms: boolean;
  readiness: PaxRoomingReadiness;
};

/** Months of validity required after travel end before a passport is "expiring". */
export const PASSPORT_EXPIRY_MONTHS = 6;

// --- ported helpers (Classic page.tsx) ---

function normalizeRoomingCode(value?: string | null): string {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function getRoomOccupancyCapacity(value: RoomOccupancy, roomType?: string | null): number | null {
  const roomingCode = normalizeRoomingCode(roomType);
  if (['sgl', 'single', 'child_with_bed', 'cwb', 'child_no_bed', 'cnb'].includes(roomingCode)) return 1;
  if (['dbl', 'double', 'twn', 'twin'].includes(roomingCode)) return 2;
  if (['trpl', 'triple'].includes(roomingCode)) return 3;
  if (value === 'single') return 1;
  if (value === 'double') return 2;
  if (value === 'triple') return 3;
  if (value === 'quad') return 4;
  return null;
}

/** Verbatim port of Classic validity (page.tsx:2855-2858). */
export function computeRoomValidity(capacity: number | null, assignmentCount: number): RoomValidity {
  if (capacity === null) {
    return assignmentCount > 0 ? 'Assigned' : 'Needs occupancy';
  }
  return assignmentCount === capacity ? 'Valid' : 'Mismatch';
}

function joinName(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' ').trim();
}

// --- date helpers (pure, UTC, no current-date dependency) ------------------

function parseDateOnly(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addMonthsUTC(date: Date, months: number): Date {
  const r = new Date(date.getTime());
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function passengerName(p: RawPassenger): string {
  const composed = joinName([p.title, p.firstName, p.lastName]);
  return p.fullName?.trim() || composed || 'Passenger';
}

function mapPassenger(p: RawPassenger, travelEnd: Date | null): PaxRowVM {
  const passportMasked = p.passportNumberMasked ?? null;
  const expiry = parseDateOnly(p.passportExpiryDate);
  const passportExpiryDaysToTravel = travelEnd && expiry ? daysBetween(travelEnd, expiry) : null;
  // Expiring = valid for fewer than PASSPORT_EXPIRY_MONTHS after travel end.
  // Skipped entirely when travel end is unknown (no false warning).
  const passportExpiring = Boolean(
    travelEnd && expiry && expiry.getTime() < addMonthsUTC(travelEnd, PASSPORT_EXPIRY_MONTHS).getTime(),
  );
  return {
    id: p.id,
    name: passengerName(p),
    isLead: Boolean(p.isLead),
    nationality: p.nationality ?? null,
    passportMasked,
    passportExpiry: p.passportExpiryDate ?? null,
    arrivalFlight: p.arrivalFlight ?? null,
    departureFlight: p.departureFlight ?? null,
    dietaryNotes: p.dietaryNotes ?? null,
    roomingNotes: p.roomingNotes ?? null,
    missingPassport: !passportMasked || !passportMasked.trim(),
    passportExpiring,
    passportExpiryDaysToTravel,
  };
}

function mapRoom(entry: RawRoomingEntry): RoomRowVM {
  const occupancy: RoomOccupancy = entry.occupancy ?? 'unknown';
  const capacity = getRoomOccupancyCapacity(occupancy, entry.roomType);
  const assignments = Array.isArray(entry.assignments) ? entry.assignments : [];
  const assignedNames = assignments
    .map((a) => (a.bookingPassenger ? joinName([a.bookingPassenger.title, a.bookingPassenger.firstName, a.bookingPassenger.lastName]) : ''))
    .filter(Boolean);
  return {
    id: entry.id,
    label: entry.roomType || `Room ${entry.sortOrder ?? 0}`,
    occupancy,
    capacity,
    assignedNames,
    notes: entry.notes ?? null,
    validity: computeRoomValidity(capacity, assignments.length),
  };
}

/**
 * Advisory readiness warnings for the pax/rooming tab (PR-1). Pure; derived
 * from booking counts + already-mapped pax/rooms. Every item is a non-blocking
 * `warning`. No finance, no mutation.
 */
function buildPaxRoomingReadiness(input: {
  detail: RawBookingDetail;
  passengers: PaxRowVM[];
  rooms: RoomRowVM[];
  assignedPassengerIds: Set<string>;
}): PaxRoomingReadiness {
  const { detail, passengers, rooms, assignedPassengerIds } = input;
  const warnings: PaxRoomingWarning[] = [];
  const totalPax = Math.max(0, Number(detail?.adults ?? 0) + Number(detail?.children ?? 0));
  const roomCount = Math.max(0, Number(detail?.roomCount ?? 0));

  // 1) room capacity vs pax count (skip when either is unknown).
  if (totalPax > 0 && rooms.length > 0) {
    const sumCapacity = rooms.reduce((acc, r) => acc + (r.capacity ?? r.assignedNames.length), 0);
    if (sumCapacity !== totalPax) {
      warnings.push({
        code: 'room-count-vs-pax',
        level: 'warning',
        count: Math.abs(sumCapacity - totalPax),
        message: `Room capacity (${sumCapacity}) doesn't match ${totalPax} passenger${totalPax === 1 ? '' : 's'}.`,
      });
    }
  }

  // 2) rooms created vs booking roomCount.
  if (roomCount > 0 && rooms.length !== roomCount) {
    warnings.push({
      code: 'rooms-vs-roomCount',
      level: 'warning',
      count: Math.abs(rooms.length - roomCount),
      message: `${rooms.length} room${rooms.length === 1 ? '' : 's'} created vs ${roomCount} on the booking.`,
    });
  }

  // 3) unassigned passengers (only meaningful once rooms exist).
  if (rooms.length > 0 && passengers.length > 0) {
    const unassigned = passengers.filter((p) => !assignedPassengerIds.has(p.id)).length;
    if (unassigned > 0) {
      warnings.push({
        code: 'unassigned-passengers',
        level: 'warning',
        count: unassigned,
        message: `${unassigned} passenger${unassigned === 1 ? '' : 's'} not assigned to a room.`,
      });
    }
  }

  // 4) empty rooms.
  const emptyRooms = rooms.filter((r) => r.assignedNames.length === 0).length;
  if (emptyRooms > 0) {
    warnings.push({
      code: 'empty-rooms',
      level: 'warning',
      count: emptyRooms,
      message: `${emptyRooms} room${emptyRooms === 1 ? '' : 's'} with no passengers.`,
    });
  }

  // 5) missing passport.
  const missingPassport = passengers.filter((p) => p.missingPassport).length;
  if (missingPassport > 0) {
    warnings.push({
      code: 'missing-passport',
      level: 'warning',
      count: missingPassport,
      message: `${missingPassport} passenger${missingPassport === 1 ? '' : 's'} missing a passport.`,
    });
  }

  // 6) passport expiry within 6 months of travel end (skipped when travel end unknown).
  const expiring = passengers.filter((p) => p.passportExpiring).length;
  if (expiring > 0) {
    warnings.push({
      code: 'passport-expiry',
      level: 'warning',
      count: expiring,
      message: `${expiring} passport${expiring === 1 ? '' : 's'} expiring within 6 months of travel.`,
    });
  }

  return { warnings, isReady: warnings.length === 0 };
}

export function buildPaxRoomingVM(detail: RawBookingDetail): PaxRoomingVM {
  const travelEnd = parseDateOnly(detail?.endDate) ?? parseDateOnly(detail?.startDate);
  const rawRooming = Array.isArray(detail?.roomingEntries) ? detail!.roomingEntries! : [];
  const passengers = (Array.isArray(detail?.passengers) ? detail!.passengers! : []).map((p) =>
    mapPassenger(p, travelEnd),
  );
  const rooms = rawRooming
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(mapRoom);

  const assignedPassengerIds = new Set<string>();
  for (const entry of rawRooming) {
    for (const a of entry.assignments ?? []) {
      const pid = a.bookingPassenger?.id;
      if (pid) assignedPassengerIds.add(pid);
    }
  }

  const readiness = buildPaxRoomingReadiness({ detail, passengers, rooms, assignedPassengerIds });

  return {
    passengers,
    rooms,
    hasPassengers: passengers.length > 0,
    hasRooms: rooms.length > 0,
    readiness,
  };
}
