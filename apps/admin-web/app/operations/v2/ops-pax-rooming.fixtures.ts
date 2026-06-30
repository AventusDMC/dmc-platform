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
