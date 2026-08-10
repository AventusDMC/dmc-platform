import test = require('node:test');
import assert = require('node:assert/strict');
import { PATH_METADATA } from '@nestjs/common/constants';
const { BookingsService, projectOperationsGridRowV2 } = require('./bookings.service');
const { BookingsController } = require('./bookings.controller');
const { ROLES_KEY } = require('../auth/auth.decorators');

// Ops-DG-2: V2-scoped, REDACTED operations grid. The V2 board must receive ONLY the
// allowlisted fields; the shared/Classic route must keep the full shape (driver/vehicle/
// notes) that Classic dispatch needs.

function createService(prisma: any = {}) {
  return new BookingsService(
    prisma,
    { log: async () => null } as any,
    { log: async () => null } as any,
    { checkBookingHotelAllotmentAvailability: async () => ({ blockers: [], warnings: [] }) } as any,
  );
}

const ALLOWLIST = [
  'id', 'order', 'serviceType', 'description', 'dayNumber', 'dayTitle', 'status',
  'operationalDate', 'operationalTime', 'supplierId', 'supplierName', 'assignedSupplierId',
  'assignedSupplierName', 'assignmentStatus', 'supplierConfirmationStatus', 'voucherStatus',
  'mealPlan', 'nights', 'pickupLocation', 'dropoffLocation',
].sort();

// A FULL Classic operations-grid row: the 20 allowlisted fields + all the fields that must
// NOT reach V2 (driver/vehicle/notes/ids) + fabricated cost/PII/contact that must never leak.
const FULL_ROW = {
  id: 'r1', order: 1, serviceType: 'HOTEL', description: 'Overnight Amman', dayNumber: 2, dayTitle: 'Amman',
  status: 'PENDING', operationalDate: '2026-06-01', operationalTime: '14:00',
  supplierId: 's1', supplierName: 'Sup', assignedSupplierId: 'as1', assignedSupplierName: 'ASup',
  assignmentStatus: 'ASSIGNED', supplierConfirmationStatus: 'CONFIRMED', voucherStatus: 'GENERATED',
  mealPlan: 'HB', nights: 2, pickupLocation: 'QAIA', dropoffLocation: 'Hotel',
  // ---- removed for V2 (Classic dispatch fields / internal ids / free-text) ----
  driverPhone: '+100', driverName: 'Dan Driver', driverId: 'd1', vehicleId: 'v1', vehicleName: 'Van',
  vehiclePlateNumber: 'ABC-123', assignedVehicleId: 'av1', assignedGuideId: 'ag1', assignmentNotes: 'notes',
  assignedAt: 'ts', assignedBy: 'u1', confirmationNotes: 'cn', confirmationReference: 'ref',
  supplierConfirmationCode: 'code', confirmationRequestedAt: 'ts', confirmationReceivedAt: 'ts',
  confirmedBy: 'u2', voucherGeneratedAt: 'ts', specialRequests: 'sr',
  // ---- cost / PII / contact that must NEVER appear in any grid payload ----
  baseCost: 999, totalCost: 999, totalSell: 999, price: 999, margin: 999, payable: 999,
  supplierPayment: 999, supplierDiscount: 5, guestPhone: '+200', guestEmail: 'g@x.test',
  passportNumber: 'X1', supplierEmail: 's@x.test', ratePolicies: { x: 1 }, token: 'tok',
};

const FORBIDDEN = [
  'driverPhone', 'driverName', 'driverId', 'vehicleId', 'vehicleName', 'vehiclePlateNumber',
  'assignedVehicleId', 'assignedGuideId', 'assignmentNotes', 'assignedAt', 'assignedBy',
  'confirmationNotes', 'confirmationReference', 'supplierConfirmationCode', 'confirmationRequestedAt',
  'confirmationReceivedAt', 'confirmedBy', 'voucherGeneratedAt', 'specialRequests',
  'baseCost', 'totalCost', 'totalSell', 'price', 'margin', 'payable', 'supplierPayment',
  'supplierDiscount', 'guestPhone', 'guestEmail', 'passportNumber', 'supplierEmail', 'ratePolicies', 'token',
];

test('projectOperationsGridRowV2 returns ONLY the allowlist and excludes all sensitive fields', () => {
  const projected = projectOperationsGridRowV2(FULL_ROW);
  assert.deepEqual(Object.keys(projected).sort(), ALLOWLIST);
  for (const k of FORBIDDEN) assert.equal(k in projected, false, `V2 row must not include ${k}`);
  // Allowlisted values are carried through faithfully.
  assert.equal(projected.serviceType, 'HOTEL');
  assert.equal(projected.mealPlan, 'HB');
  assert.equal(projected.nights, 2);
  assert.equal(projected.pickupLocation, 'QAIA');
  // No leaked money/PII values anywhere.
  assert.equal(/999|\+100|\+200|g@x\.test|s@x\.test|X1|Dan Driver|ABC-123/.test(JSON.stringify(projected)), false);
});

test('projectOperationsGridRowV2 is pure — it does NOT mutate the input (Classic shape untouched)', () => {
  const input = { ...FULL_ROW };
  projectOperationsGridRowV2(input);
  assert.equal(input.driverPhone, '+100');
  assert.equal(input.driverName, 'Dan Driver');
  assert.equal(input.vehicleName, 'Van');
  assert.equal(input.assignmentNotes, 'notes');
});

test('projectOperationsGridRowV2 omits absent allowlist keys (no undefined/null padding)', () => {
  const projected = projectOperationsGridRowV2({ id: 'x', serviceType: 'GUIDE' });
  assert.deepEqual(Object.keys(projected).sort(), ['id', 'serviceType']);
});

test('getOperationalServiceGridV2 reuses the shared grid + projects rows; keeps booking + manifest', async () => {
  const service = createService();
  const fixture = {
    booking: { id: 'b1', bookingRef: 'BK-1', status: 'draft', title: 'T' },
    passengerManifest: { status: 'PENDING', expected: 2, received: 0, missingRecords: 2, incompleteRecords: 0, incomplete: true },
    rows: [FULL_ROW, { ...FULL_ROW, id: 'r2' }],
  };
  // Reuse the shared builder unchanged; stub it to return the fixture.
  (service as any).getOperationalServiceGrid = async () => fixture;

  const v2 = await service.getOperationalServiceGridV2('b1', { companyId: 'c1' } as any);
  assert.deepEqual(v2.booking, fixture.booking);
  assert.deepEqual(v2.passengerManifest, fixture.passengerManifest);
  assert.equal(v2.rows.length, 2);
  for (const row of v2.rows) {
    assert.deepEqual(Object.keys(row).sort(), ALLOWLIST);
    for (const k of FORBIDDEN) assert.equal(k in row, false, `V2 grid row must not include ${k}`);
  }
  // Classic/shared shape untouched: the underlying fixture rows STILL carry driverPhone.
  assert.equal(fixture.rows[0].driverPhone, '+100');
  assert.equal(fixture.rows[0].vehicleName, 'Van');
});

test('getOperationalServiceGridV2 returns null when the booking is not found', async () => {
  const service = createService();
  (service as any).getOperationalServiceGrid = async () => null;
  assert.equal(await service.getOperationalServiceGridV2('missing', {} as any), null);
});

test('routes: the V2 grid route exists (admin/operations) and the Classic route path is unchanged', () => {
  assert.equal((Reflect as any).getMetadata(PATH_METADATA, BookingsController.prototype.getOperationalServiceGridV2), ':id/v2/operations-grid');
  assert.deepEqual((Reflect as any).getMetadata(ROLES_KEY, BookingsController.prototype.getOperationalServiceGridV2), ['admin', 'operations']);
  // Classic/shared route path is untouched.
  assert.equal((Reflect as any).getMetadata(PATH_METADATA, BookingsController.prototype.getOperationalServiceGrid), ':id/operations-grid');
});
