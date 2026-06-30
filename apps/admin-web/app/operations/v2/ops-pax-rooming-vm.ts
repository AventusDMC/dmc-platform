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

export type PaxRoomingVM = {
  passengers: PaxRowVM[];
  rooms: RoomRowVM[];
  hasPassengers: boolean;
  hasRooms: boolean;
};

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

function passengerName(p: RawPassenger): string {
  const composed = joinName([p.title, p.firstName, p.lastName]);
  return p.fullName?.trim() || composed || 'Passenger';
}

function mapPassenger(p: RawPassenger): PaxRowVM {
  return {
    id: p.id,
    name: passengerName(p),
    isLead: Boolean(p.isLead),
    nationality: p.nationality ?? null,
    passportMasked: p.passportNumberMasked ?? null,
    passportExpiry: p.passportExpiryDate ?? null,
    arrivalFlight: p.arrivalFlight ?? null,
    departureFlight: p.departureFlight ?? null,
    dietaryNotes: p.dietaryNotes ?? null,
    roomingNotes: p.roomingNotes ?? null,
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

export function buildPaxRoomingVM(detail: RawBookingDetail): PaxRoomingVM {
  const passengers = (Array.isArray(detail?.passengers) ? detail!.passengers! : []).map(mapPassenger);
  const rooms = (Array.isArray(detail?.roomingEntries) ? detail!.roomingEntries! : [])
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(mapRoom);
  return {
    passengers,
    rooms,
    hasPassengers: passengers.length > 0,
    hasRooms: rooms.length > 0,
  };
}
