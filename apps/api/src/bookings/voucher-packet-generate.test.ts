import test = require('node:test');
import assert = require('node:assert/strict');
import {
  buildVoucherPacketSnapshot,
  buildVoucherPacketItemSnapshot,
  computeVoucherPacketContentHash,
} from './voucher-packet-generate';
import { isOpsV2VoucherPacketEnabled } from './ops-voucher-packet-flags';
import { computeVoucherPacketGroups, type PackableService } from './voucher-packet-grouping';

function member(overrides: Partial<PackableService> = {}): PackableService {
  return {
    id: 's1',
    assignedSupplierId: 'sup-1',
    assignedSupplierName: 'Hotel A',
    assignmentStatus: 'ASSIGNED',
    serviceType: 'HOTEL',
    operationType: 'HOTEL',
    serviceDate: '2026-10-01',
    bookingDayId: 'd1',
    dayNumber: 1,
    nights: 2,
    label: 'Hotel A stay',
    ...overrides,
  };
}

test('flag helper: fail-closed unless exactly "true"', () => {
  const prev = process.env.OPS_V2_VOUCHER_PACKET_ENABLED;
  try {
    delete process.env.OPS_V2_VOUCHER_PACKET_ENABLED;
    assert.equal(isOpsV2VoucherPacketEnabled(), false, 'absent → off');
    process.env.OPS_V2_VOUCHER_PACKET_ENABLED = '';
    assert.equal(isOpsV2VoucherPacketEnabled(), false, 'empty → off');
    process.env.OPS_V2_VOUCHER_PACKET_ENABLED = 'TRUE';
    assert.equal(isOpsV2VoucherPacketEnabled(), false, 'TRUE (wrong case) → off');
    process.env.OPS_V2_VOUCHER_PACKET_ENABLED = '1';
    assert.equal(isOpsV2VoucherPacketEnabled(), false, '1 → off');
    process.env.OPS_V2_VOUCHER_PACKET_ENABLED = 'true';
    assert.equal(isOpsV2VoucherPacketEnabled(), true, 'true → on');
  } finally {
    if (prev === undefined) delete process.env.OPS_V2_VOUCHER_PACKET_ENABLED;
    else process.env.OPS_V2_VOUCHER_PACKET_ENABLED = prev;
  }
});

test('contentHash is deterministic and order-independent', () => {
  const a = [member({ id: 'a' }), member({ id: 'b' })];
  const b = [member({ id: 'b' }), member({ id: 'a' })];
  assert.equal(computeVoucherPacketContentHash(a), computeVoucherPacketContentHash(b));
  // A change to a member (date) changes the hash.
  const c = [member({ id: 'a', serviceDate: '2026-12-31' }), member({ id: 'b' })];
  assert.notEqual(computeVoucherPacketContentHash(a), computeVoucherPacketContentHash(c));
  // sha256 hex.
  assert.match(computeVoucherPacketContentHash(a), /^[0-9a-f]{64}$/);
});

test('packet + item snapshots are PII-free and finance-free', () => {
  const members = [member()];
  const group = computeVoucherPacketGroups(members)[0];
  const packetSnap = buildVoucherPacketSnapshot(group, 'BK-1', members);
  const itemSnap = buildVoucherPacketItemSnapshot(members[0]);
  const blob = JSON.stringify({ packetSnap, itemSnap });
  for (const forbidden of ['unitCost', 'unitSell', 'totalCost', 'totalSell', 'margin', 'payable', 'passport', 'dateOfBirth', 'emergencyContact']) {
    assert.ok(!blob.includes(forbidden), `snapshot leaked ${forbidden}`);
  }
  assert.equal(packetSnap.supplierName, 'Hotel A');
  assert.equal(packetSnap.serviceCount, 1);
  assert.equal(packetSnap.services[0].label, 'Hotel A stay');
  assert.equal(itemSnap.bookingServiceId, 's1');
  assert.equal(itemSnap.supplierName, 'Hotel A');
});
