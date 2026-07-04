/**
 * Fixtures for the Passengers & Rooming view model + render tests.
 *
 * Covers: a lead passenger, a passenger with missing fields, dietary/rooming
 * notes, and rooming entries hitting every validity state (Valid / Mismatch /
 * Needs occupancy / Assigned). One passenger carries an injected financial
 * field (9999) that must never survive the allowlist mapping.
 */
import type { RawBookingDetail } from './ops-pax-rooming-vm';

export const COST_LEAK_VALUE = '9999';

export const SAMPLE_DETAIL: RawBookingDetail = {
  status: 'confirmed',
  bookingRef: 'BK-2026-0004',
  passengers: [
    {
      id: 'p-lead',
      firstName: 'James',
      lastName: 'Anderson',
      title: 'Mr',
      isLead: true,
      nationality: 'USA',
      passportNumberMasked: '55•••••1',
      passportExpiryDate: '2029-03-10',
      arrivalFlight: 'RJ 268',
      departureFlight: 'RJ 269',
      dietaryNotes: null,
      roomingNotes: 'Prefers high floor',
      // injected internal financial field — NOT in the allowlist:
      ...( { unitSell: 9999 } as Record<string, unknown> ),
    },
    {
      id: 'p-sarah',
      firstName: 'Sarah',
      lastName: 'Anderson',
      title: 'Mrs',
      isLead: false,
      nationality: 'USA',
      passportNumberMasked: '55•••••2',
      passportExpiryDate: '2030-08-22',
      arrivalFlight: 'RJ 268',
      departureFlight: 'RJ 269',
      dietaryNotes: 'Vegetarian',
      roomingNotes: null,
    },
    {
      // missing fields — must render safely (no passport / nationality / flights)
      id: 'p-mia',
      firstName: 'Mia',
      lastName: 'Anderson',
      title: 'Ms',
      isLead: false,
      nationality: null,
      passportNumberMasked: null,
      passportExpiryDate: null,
      arrivalFlight: null,
      departureFlight: null,
      dietaryNotes: null,
      roomingNotes: null,
    },
  ],
  roomingEntries: [
    {
      // Valid: double capacity 2, 2 assigned
      id: 'r-valid',
      roomType: 'DBL',
      occupancy: 'double',
      notes: null,
      sortOrder: 1,
      assignments: [
        { id: 'a1', bookingPassenger: { id: 'p-lead', firstName: 'James', lastName: 'Anderson', title: 'Mr', isLead: true } },
        { id: 'a2', bookingPassenger: { id: 'p-sarah', firstName: 'Sarah', lastName: 'Anderson', title: 'Mrs', isLead: false } },
      ],
    },
    {
      // Mismatch: double capacity 2, only 1 assigned
      id: 'r-mismatch',
      roomType: 'Twin',
      occupancy: 'double',
      notes: null,
      sortOrder: 2,
      assignments: [
        { id: 'a3', bookingPassenger: { id: 'p-mia', firstName: 'Mia', lastName: 'Anderson', title: 'Ms', isLead: false } },
      ],
    },
    {
      // Needs occupancy: unknown capacity, 0 assigned
      id: 'r-needs',
      roomType: null,
      occupancy: 'unknown',
      notes: null,
      sortOrder: 3,
      assignments: [],
    },
    {
      // Assigned: unknown capacity, has assignments
      id: 'r-assigned',
      roomType: null,
      occupancy: 'unknown',
      notes: 'Extra bed requested',
      sortOrder: 4,
      assignments: [
        { id: 'a4', bookingPassenger: { id: 'p-lead', firstName: 'James', lastName: 'Anderson', title: 'Mr', isLead: true } },
      ],
    },
  ],
};

export const EMPTY_DETAIL: RawBookingDetail = {
  status: 'draft',
  bookingRef: 'BK-EMPTY',
  passengers: [],
  roomingEntries: [],
};

// --- PR-1 advisory-readiness fixtures --------------------------------------

/** Triggers ALL SIX advisory warnings at once. travelEnd = 2026-09-16. */
export const WARN_DETAIL: RawBookingDetail = {
  status: 'confirmed',
  bookingRef: 'BK-WARN',
  adults: 3,
  children: 0,
  roomCount: 3, // vs 2 rooms created -> rooms-vs-roomCount
  startDate: '2026-09-15',
  endDate: '2026-09-16',
  passengers: [
    // expiring: valid only to 2027-01-10, < travelEnd(2026-09-16)+6mo(2027-03-16)
    { id: 'w1', firstName: 'Ana', lastName: 'Lopez', title: 'Ms', isLead: true, nationality: 'ESP', passportNumberMasked: '11•••••1', passportExpiryDate: '2027-01-10' },
    // missing passport + unassigned
    { id: 'w2', firstName: 'Bruno', lastName: 'Costa', title: 'Mr', isLead: false, nationality: 'PRT', passportNumberMasked: null, passportExpiryDate: null },
    // valid passport (far), unassigned
    { id: 'w3', firstName: 'Cara', lastName: 'Nolan', title: 'Ms', isLead: false, nationality: 'IRL', passportNumberMasked: '33•••••3', passportExpiryDate: '2030-01-01' },
  ],
  roomingEntries: [
    // capacity 2, only w1 assigned -> contributes to sumCapacity 2 vs pax 3
    { id: 'wr-a', roomType: 'DBL', occupancy: 'double', notes: null, sortOrder: 1, assignments: [
      { id: 'wa1', bookingPassenger: { id: 'w1', firstName: 'Ana', lastName: 'Lopez', title: 'Ms', isLead: true } },
    ] },
    // empty room
    { id: 'wr-b', roomType: null, occupancy: 'unknown', notes: null, sortOrder: 2, assignments: [] },
  ],
};

/** Clean booking — zero warnings, ready state. */
export const READY_DETAIL: RawBookingDetail = {
  status: 'confirmed',
  bookingRef: 'BK-READY',
  adults: 2,
  children: 0,
  roomCount: 1,
  startDate: '2026-09-15',
  endDate: '2026-09-16',
  passengers: [
    { id: 'r1', firstName: 'Dana', lastName: 'Reid', title: 'Ms', isLead: true, nationality: 'GBR', passportNumberMasked: 'AA•••••1', passportExpiryDate: '2030-01-01' },
    { id: 'r2', firstName: 'Evan', lastName: 'Reid', title: 'Mr', isLead: false, nationality: 'GBR', passportNumberMasked: 'BB•••••2', passportExpiryDate: '2030-01-01' },
  ],
  roomingEntries: [
    { id: 'rr-a', roomType: 'DBL', occupancy: 'double', notes: null, sortOrder: 1, assignments: [
      { id: 'ra1', bookingPassenger: { id: 'r1', firstName: 'Dana', lastName: 'Reid', title: 'Ms', isLead: true } },
      { id: 'ra2', bookingPassenger: { id: 'r2', firstName: 'Evan', lastName: 'Reid', title: 'Mr', isLead: false } },
    ] },
  ],
};

/** Passport would be expiring, but travel dates are absent -> expiry warning skipped. */
export const NO_TRAVEL_DETAIL: RawBookingDetail = {
  status: 'confirmed',
  bookingRef: 'BK-NOTRAVEL',
  adults: 1,
  children: 0,
  roomCount: 1,
  // no startDate / endDate on purpose
  passengers: [
    { id: 'n1', firstName: 'Faye', lastName: 'Ortiz', title: 'Ms', isLead: true, nationality: 'MEX', passportNumberMasked: 'CC•••••1', passportExpiryDate: '2026-10-01' },
  ],
  roomingEntries: [
    { id: 'nr-a', roomType: 'SGL', occupancy: 'single', notes: null, sortOrder: 1, assignments: [
      { id: 'na1', bookingPassenger: { id: 'n1', firstName: 'Faye', lastName: 'Ortiz', title: 'Ms', isLead: true } },
    ] },
  ],
};
