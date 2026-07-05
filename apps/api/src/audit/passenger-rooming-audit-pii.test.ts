import test = require('node:test');
import assert = require('node:assert/strict');

const { BookingsService } = require('../bookings/bookings.service');

/**
 * PR-3c — Passenger / Rooming audit PII safety (regression lock-in).
 *
 * Passenger and rooming mutations must never write raw passenger PII into
 * `BookingAuditLog`. The audit value formatters emit name / room labels only, so
 * this is safe today — these tests seed every mutation with unique sentinel
 * values in ALL 15 sensitive fields and assert none of them reach any audit row.
 * They exercise the real service methods against a Prisma mock; the mock returns
 * fully-populated (worst-case) rows so a future change that spreads the entity
 * into the audit would fail here.
 *
 * Test-only: no production behaviour is asserted to change.
 */

const actor = { id: 'user-dmc-admin', userId: 'user-dmc-admin', companyId: 'dmc-company', role: 'admin', label: 'DMC Admin' };
const auditActor = { userId: actor.userId, label: actor.label };

// Unique sentinel per sensitive field — the exact strings we assert never leak.
const SENT = {
  passportNumber: 'PIISENTINEL-passportNumber-a1',
  // Date fields must survive manifest date-normalization (update re-normalizes the
  // merged row), so these are unique VALID dates — still tokens that never appear
  // in a name or room label, so they work as leak sentinels.
  passportIssueDate: '2017-09-03',
  passportExpiryDate: '2035-12-29',
  dateOfBirth: '1983-04-17',
  gender: 'PIISENTINEL-gender-a5',
  entryPoint: 'PIISENTINEL-entryPoint-a6',
  visaStatus: 'PIISENTINEL-visaStatus-a7',
  emergencyContactName: 'PIISENTINEL-emergencyContactName-a8',
  emergencyContactPhone: 'PIISENTINEL-emergencyContactPhone-a9',
  dietaryNotes: 'PIISENTINEL-dietaryNotes-a10',
  roomingNotes: 'PIISENTINEL-roomingNotes-a11',
  arrivalFlight: 'PIISENTINEL-arrivalFlight-a12',
  departureFlight: 'PIISENTINEL-departureFlight-a13',
  nationality: 'PIISENTINEL-nationality-a14',
  notes: 'PIISENTINEL-notes-a15',
};
const PII_VALUES = Object.values(SENT);

function fullPiiPassenger(overrides: Record<string, unknown> = {}) {
  return {
    id: 'passenger-1',
    bookingId: 'booking-1',
    fullName: 'Rana Saleh',
    firstName: 'Rana',
    lastName: 'Saleh',
    title: 'Ms',
    isLead: false,
    ...SENT,
    roomingAssignments: [],
    ...overrides,
  };
}

function fullPiiRoomEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rooming-1',
    bookingId: 'booking-1',
    roomType: 'TWN',
    occupancy: 'double',
    sortOrder: 1,
    notes: SENT.roomingNotes, // even room notes must not surface (formatter ignores them)
    assignments: [],
    ...overrides,
  };
}

function createService(auditRows: any[], opts: { passengers?: any[] } = {}) {
  const tx = {
    booking: {
      findFirst: async ({ where }: any) => {
        // The auto-assign amendment check queries by amendedFromId — no newer amendment.
        if (where?.amendedFromId) return null;
        return { id: 'booking-1', passengers: opts.passengers ?? [], roomingEntries: [] };
      },
    },
    bookingPassenger: {
      findFirst: async () => fullPiiPassenger(),
      create: async () => fullPiiPassenger({ id: 'passenger-created' }),
      update: async () => fullPiiPassenger({ id: 'passenger-updated', isLead: true }),
      updateMany: async () => ({ count: 0 }),
      delete: async () => fullPiiPassenger(),
      count: async () => 0,
    },
    bookingRoomingEntry: {
      findFirst: async () => fullPiiRoomEntry(),
      create: async () => fullPiiRoomEntry({ id: 'rooming-created' }),
      update: async () => fullPiiRoomEntry({ id: 'rooming-updated' }),
      delete: async () => ({}),
    },
    bookingRoomingAssignment: {
      findUnique: async () => ({ id: 'assignment-1' }),
      create: async () => ({ id: 'assignment-created' }),
      delete: async () => ({}),
      count: async () => 0,
    },
    bookingAuditLog: {
      create: async ({ data }: any) => {
        auditRows.push(data);
        return data;
      },
    },
  };
  const prisma = { $transaction: async (cb: any) => cb(tx) };
  return new BookingsService(
    prisma,
    { log: async () => null } as any,
    { log: async () => null } as any,
    { checkBookingHotelAllotmentAvailability: async () => ({ blockers: [], warnings: [] }) } as any,
  );
}

/** Assert no sentinel PII value appears anywhere in the captured audit rows. */
function assertNoPii(auditRows: any[], context: string) {
  assert.ok(auditRows.length > 0, `${context}: expected at least one audit row`);
  const serialized = JSON.stringify(auditRows);
  for (const value of PII_VALUES) {
    assert.ok(!serialized.includes(value), `${context}: audit leaked PII value ${value}`);
  }
}

const manifestInput = {
  firstName: 'Rana',
  lastName: 'Saleh',
  title: 'Ms',
  gender: SENT.gender,
  nationality: SENT.nationality,
  passportNumber: SENT.passportNumber,
  passportIssueDate: SENT.passportIssueDate,
  passportExpiryDate: SENT.passportExpiryDate,
  dateOfBirth: SENT.dateOfBirth,
  arrivalFlight: SENT.arrivalFlight,
  departureFlight: SENT.departureFlight,
  entryPoint: SENT.entryPoint,
  visaStatus: SENT.visaStatus,
  emergencyContactName: SENT.emergencyContactName,
  emergencyContactPhone: SENT.emergencyContactPhone,
  dietaryNotes: SENT.dietaryNotes,
  roomingNotes: SENT.roomingNotes,
  notes: SENT.notes,
};

test('createPassenger audit stores name only, never raw PII', async () => {
  const rows: any[] = [];
  await createService(rows).createPassenger('booking-1', { ...manifestInput, actor: auditActor, companyActor: actor });
  assert.match(JSON.stringify(rows), /Rana Saleh/);
  assert.equal(rows[0].action, 'booking_passenger_created');
  assertNoPii(rows, 'createPassenger');
});

test('updatePassenger audit stores names only, never raw PII', async () => {
  const rows: any[] = [];
  await createService(rows).updatePassenger('booking-1', 'passenger-1', {
    firstName: 'Rana',
    dietaryNotes: SENT.dietaryNotes,
    roomingNotes: SENT.roomingNotes,
    actor: auditActor,
    companyActor: actor,
  });
  assert.equal(rows[0].action, 'booking_passenger_updated');
  assertNoPii(rows, 'updatePassenger');
});

test('deletePassenger audit stores name only, never raw PII', async () => {
  const rows: any[] = [];
  await createService(rows).deletePassenger('booking-1', 'passenger-1', auditActor, actor);
  assert.equal(rows[0].action, 'booking_passenger_deleted');
  assertNoPii(rows, 'deletePassenger');
});

test('setLeadPassenger audit stores names only, never raw PII', async () => {
  const rows: any[] = [];
  await createService(rows).setLeadPassenger('booking-1', 'passenger-1', auditActor, actor);
  assert.equal(rows[0].action, 'booking_passenger_lead_set');
  assertNoPii(rows, 'setLeadPassenger');
});

test('createRoomingEntry audit stores room label only, never raw PII', async () => {
  const rows: any[] = [];
  await createService(rows).createRoomingEntry('booking-1', {
    roomType: 'TWN',
    occupancy: 'double',
    notes: SENT.roomingNotes,
    actor: auditActor,
    companyActor: actor,
  });
  assert.equal(rows[0].action, 'booking_rooming_entry_created');
  assertNoPii(rows, 'createRoomingEntry');
});

test('updateRoomingEntry audit stores room labels only, never raw PII', async () => {
  const rows: any[] = [];
  await createService(rows).updateRoomingEntry('booking-1', 'rooming-1', {
    roomType: 'TWN',
    occupancy: 'double',
    actor: auditActor,
    companyActor: actor,
  });
  assert.equal(rows[0].action, 'booking_rooming_entry_updated');
  assertNoPii(rows, 'updateRoomingEntry');
});

test('deleteRoomingEntry audit stores room label only, never raw PII', async () => {
  const rows: any[] = [];
  await createService(rows).deleteRoomingEntry('booking-1', 'rooming-1', auditActor, actor);
  assert.equal(rows[0].action, 'booking_rooming_entry_deleted');
  assertNoPii(rows, 'deleteRoomingEntry');
});

test('assignPassengerToRoom audit stores name + room only, never raw PII', async () => {
  const rows: any[] = [];
  await createService(rows).assignPassengerToRoom('booking-1', 'rooming-1', 'passenger-1', auditActor, actor);
  assert.equal(rows[0].action, 'booking_rooming_assignment_created');
  assertNoPii(rows, 'assignPassengerToRoom');
});

test('unassignPassengerFromRoom audit stores name + room only, never raw PII', async () => {
  const rows: any[] = [];
  await createService(rows).unassignPassengerFromRoom('booking-1', 'rooming-1', 'passenger-1', auditActor, actor);
  assert.equal(rows[0].action, 'booking_rooming_assignment_deleted');
  assertNoPii(rows, 'unassignPassengerFromRoom');
});

test('autoAssignRooming audit stores a count message only, never raw PII', async () => {
  const rows: any[] = [];
  const passengers = [fullPiiPassenger({ id: 'p-1', roomingAssignments: [] })];
  await createService(rows, { passengers }).autoAssignRooming('booking-1', { actor: auditActor, companyActor: actor });
  assert.equal(rows[0].action, 'booking_rooming_auto_assigned');
  assert.match(String(rows[0].newValue), /Auto-allocated/);
  assertNoPii(rows, 'autoAssignRooming');
});

test('consolidated: no passenger/rooming mutation leaks any PII sentinel into audit', async () => {
  const rows: any[] = [];
  const svc = () => createService(rows, { passengers: [fullPiiPassenger({ id: 'p-1', roomingAssignments: [] })] });

  await svc().createPassenger('booking-1', { ...manifestInput, actor: auditActor, companyActor: actor });
  await svc().updatePassenger('booking-1', 'passenger-1', { firstName: 'Rana', actor: auditActor, companyActor: actor });
  await svc().deletePassenger('booking-1', 'passenger-1', auditActor, actor);
  await svc().setLeadPassenger('booking-1', 'passenger-1', auditActor, actor);
  await svc().createRoomingEntry('booking-1', { roomType: 'TWN', occupancy: 'double', actor: auditActor, companyActor: actor });
  await svc().updateRoomingEntry('booking-1', 'rooming-1', { occupancy: 'double', actor: auditActor, companyActor: actor });
  await svc().deleteRoomingEntry('booking-1', 'rooming-1', auditActor, actor);
  await svc().assignPassengerToRoom('booking-1', 'rooming-1', 'passenger-1', auditActor, actor);
  await svc().unassignPassengerFromRoom('booking-1', 'rooming-1', 'passenger-1', auditActor, actor);
  await svc().autoAssignRooming('booking-1', { actor: auditActor, companyActor: actor });

  assert.equal(rows.length, 10, 'expected exactly one audit row per mutation');
  assertNoPii(rows, 'consolidated');
  // Sanity: the audit still captured meaningful (non-PII) content.
  assert.match(JSON.stringify(rows), /Rana Saleh/);
  assert.match(JSON.stringify(rows), /TWN/);
});
