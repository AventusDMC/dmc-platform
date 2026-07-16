import test = require('node:test');
import assert = require('node:assert/strict');
import {
  computeVoucherPacketGroups,
  type PackableService,
} from './voucher-packet-grouping';

function svc(overrides: Partial<PackableService>): PackableService {
  return {
    id: 'svc',
    assignedSupplierId: 'sup-1',
    assignedSupplierName: 'Supplier One',
    assignmentStatus: 'ASSIGNED',
    serviceType: 'ACTIVITY',
    ...overrides,
  };
}

test('transport: same supplier across days = ONE packet', () => {
  const groups = computeVoucherPacketGroups([
    svc({ id: 't1', serviceType: 'TRANSPORT', bookingDayId: 'd1', dayNumber: 1 }),
    svc({ id: 't2', serviceType: 'TRANSPORT', bookingDayId: 'd2', dayNumber: 2 }),
    svc({ id: 't3', serviceType: 'AIRPORT_TRANSFER', bookingDayId: 'd3', dayNumber: 3 }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].groupingType, 'TRANSPORT');
  assert.equal(groups[0].groupingKey, 'TRANSPORT:sup-1');
  assert.deepEqual(groups[0].serviceIds, ['t1', 't2', 't3']);
  assert.equal(groups[0].serviceCount, 3);
  assert.deepEqual(groups[0].dayNumbers, [1, 2, 3]);
});

test('hotel: per supplier + stay-start date (separate stay blocks)', () => {
  const groups = computeVoucherPacketGroups([
    svc({ id: 'h1', serviceType: 'HOTEL', serviceDate: '2026-10-01T00:00:00.000Z', nights: 2, dayNumber: 1 }),
    svc({ id: 'h2', serviceType: 'HOTEL', serviceDate: '2026-10-05T00:00:00.000Z', nights: 1, dayNumber: 5 }),
  ]);
  assert.equal(groups.length, 2);
  assert.ok(groups.every((g) => g.groupingType === 'HOTEL'));
  assert.deepEqual(groups.map((g) => g.groupingKey).sort(), [
    'HOTEL:sup-1:2026-10-01',
    'HOTEL:sup-1:2026-10-05',
  ]);
});

test('activity/guide/meal/ticket/external: per supplier + day', () => {
  const groups = computeVoucherPacketGroups([
    svc({ id: 'a1', serviceType: 'ACTIVITY', bookingDayId: 'd1', dayNumber: 1 }),
    svc({ id: 'a2', serviceType: 'ACTIVITY', bookingDayId: 'd1', dayNumber: 1 }), // same day+supplier → merge
    svc({ id: 'g1', serviceType: 'GUIDE', bookingDayId: 'd1', dayNumber: 1 }),
    svc({ id: 'm1', serviceType: 'DINING', bookingDayId: 'd1', dayNumber: 1 }),
    svc({ id: 'k1', serviceType: 'ENTRANCE_TICKET', bookingDayId: 'd1', dayNumber: 1 }),
    svc({ id: 'x1', serviceType: 'EXTERNAL_PACKAGE', bookingDayId: 'd1', dayNumber: 1 }),
  ]);
  const byType = Object.fromEntries(groups.map((g) => [g.groupingType, g]));
  assert.equal(byType['ACTIVITY'].serviceCount, 2, 'two activities same supplier+day merge');
  assert.deepEqual(byType['ACTIVITY'].serviceIds, ['a1', 'a2']);
  assert.equal(byType['GUIDE'].groupingKey, 'GUIDE:sup-1:d1');
  assert.equal(byType['MEAL'].groupingType, 'MEAL');
  assert.equal(byType['TICKET'].groupingType, 'TICKET');
  assert.equal(byType['EXTERNAL_PACKAGE'].groupingType, 'EXTERNAL_PACKAGE');
});

test('activities on different days do NOT merge', () => {
  const groups = computeVoucherPacketGroups([
    svc({ id: 'a1', serviceType: 'ACTIVITY', bookingDayId: 'd1', dayNumber: 1 }),
    svc({ id: 'a2', serviceType: 'ACTIVITY', bookingDayId: 'd2', dayNumber: 2 }),
  ]);
  assert.equal(groups.length, 2);
});

test('unassigned services are excluded', () => {
  const groups = computeVoucherPacketGroups([
    svc({ id: 'u1', serviceType: 'TRANSPORT', assignedSupplierId: null, assignmentStatus: 'UNASSIGNED' }),
    svc({ id: 'u2', serviceType: 'TRANSPORT', assignedSupplierId: 'sup-1', assignmentStatus: 'UNASSIGNED' }),
    svc({ id: 'ok', serviceType: 'TRANSPORT', assignedSupplierId: 'sup-1', assignmentStatus: 'ASSIGNED' }),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].serviceIds, ['ok']);
});

test('different suppliers never merge', () => {
  const groups = computeVoucherPacketGroups([
    svc({ id: 't1', serviceType: 'TRANSPORT', assignedSupplierId: 'sup-1', assignedSupplierName: 'One' }),
    svc({ id: 't2', serviceType: 'TRANSPORT', assignedSupplierId: 'sup-2', assignedSupplierName: 'Two' }),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.supplierId).sort(), ['sup-1', 'sup-2']);
});

test('deterministic: same input → identical output (keys + order)', () => {
  const input = [
    svc({ id: 'z', serviceType: 'GUIDE', assignedSupplierId: 'sup-2', assignedSupplierName: 'Zeta', bookingDayId: 'd2', dayNumber: 2 }),
    svc({ id: 'a', serviceType: 'TRANSPORT', assignedSupplierId: 'sup-1', assignedSupplierName: 'Alpha' }),
    svc({ id: 'h', serviceType: 'HOTEL', assignedSupplierId: 'sup-1', assignedSupplierName: 'Alpha', serviceDate: '2026-10-02', dayNumber: 2 }),
  ];
  const a = computeVoucherPacketGroups(input);
  const b = computeVoucherPacketGroups(input.slice().reverse());
  assert.deepEqual(a, b, 'order-independent, deterministic');
  // Type order: TRANSPORT before HOTEL before GUIDE.
  assert.deepEqual(a.map((g) => g.groupingType), ['TRANSPORT', 'HOTEL', 'GUIDE']);
});

test('empty input → empty output', () => {
  assert.deepEqual(computeVoucherPacketGroups([]), []);
});

test('DTO carries no finance/PII fields', () => {
  const groups = computeVoucherPacketGroups([svc({ id: 's1', label: 'Airport transfer' })]);
  const keys = new Set(Object.keys(groups[0]));
  for (const forbidden of ['unitCost', 'unitSell', 'totalCost', 'totalSell', 'margin', 'passportNumber', 'dateOfBirth', 'email', 'phone']) {
    assert.ok(!keys.has(forbidden), `group DTO leaked ${forbidden}`);
  }
  assert.deepEqual(groups[0].memberLabels, ['Airport transfer']);
});

// Regression anchor for the V2 supplier-field alignment fix: a service assigned
// through V2 now carries assignmentStatus=ASSIGNED (writer sets it), so it groups;
// a supplier id without ASSIGNED status (the pre-fix state) stays excluded.
test('V2-assigned service (assignmentStatus=ASSIGNED) groups; supplier id alone without ASSIGNED does not', () => {
  const groups = computeVoucherPacketGroups([
    svc({ id: 'v2', serviceType: 'ACTIVITY', assignedSupplierId: 'sup-1', assignmentStatus: 'ASSIGNED', bookingDayId: 'd1', dayNumber: 1 }),
    svc({ id: 'prefix', serviceType: 'ACTIVITY', assignedSupplierId: 'sup-1', assignmentStatus: 'UNASSIGNED', bookingDayId: 'd1', dayNumber: 1 }),
  ]);
  assert.equal(groups.length, 1, 'only the ASSIGNED service groups');
  assert.deepEqual(groups[0].serviceIds, ['v2']);
});
