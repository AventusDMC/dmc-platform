import test = require('node:test');
import assert = require('node:assert/strict');

const { BookingsService } = require('./bookings.service');
const { computeVoucherPacketContentHash } = require('./voucher-packet-generate');

/**
 * Supplier Voucher Packet V2 — S6 stale-detection tests (Prisma-mock, read-only).
 * getVoucherPacketGroups computes isStale by comparing the current group's
 * recomputed contentHash to the stored packet.contentHash — ONLY when the flag is
 * ON. Orphaned packets (group gone) are surfaced read-only. Mutation traps prove
 * NOTHING is written (no status='STALE', no audit).
 */

const HOTEL_KEY = 'HOTEL:sup-1:2026-10-01';

// The contentHash of the (single) current hotel member, computed exactly as the
// service's buildPackableServices → computeVoucherPacketContentHash would.
const MATCHING_HASH = computeVoucherPacketContentHash([
  { id: 'h1', serviceDate: '2026-10-01T00:00:00.000Z', label: 'Hotel A stay', assignedSupplierId: 'sup-1' },
]);

function mockBooking() {
  return {
    id: 'bk-1',
    bookingRef: 'BK-1',
    days: [{ id: 'd1', dayNumber: 1 }],
    services: [
      {
        id: 'h1',
        assignedSupplierId: 'sup-1',
        assignedSupplier: { name: 'Hotel A' },
        assignmentStatus: 'ASSIGNED',
        serviceType: 'HOTEL',
        serviceDate: new Date('2026-10-01T00:00:00.000Z'),
        bookingDayId: 'd1',
        description: 'Hotel A stay',
      },
    ],
  };
}

function makeService(opts: any = {}) {
  const calls = { findMany: 0 };
  const trap = (n: string) => async () => {
    throw new Error(`MUTATION not allowed: ${n}`);
  };
  const prisma = {
    voucherPacket: {
      findMany: async () => {
        calls.findMany++;
        return opts.packets ?? [];
      },
      create: trap('voucherPacket.create'),
      update: trap('voucherPacket.update'),
      delete: trap('voucherPacket.delete'),
    },
    bookingAuditLog: { create: trap('bookingAuditLog.create') },
  };
  const service = new BookingsService(
    prisma,
    { log: async () => null },
    { log: async () => null },
    { checkBookingHotelAllotmentAvailability: async () => ({ blockers: [], warnings: [] }) },
  );
  service.findOne = async () => (opts.booking === undefined ? mockBooking() : opts.booking);
  return { service, calls };
}

function withFlag(value: string | null, fn: () => Promise<void>) {
  const prev = process.env.OPS_V2_VOUCHER_PACKET_ENABLED;
  if (value === null) delete process.env.OPS_V2_VOUCHER_PACKET_ENABLED;
  else process.env.OPS_V2_VOUCHER_PACKET_ENABLED = value;
  return (async () => {
    try {
      await fn();
    } finally {
      if (prev === undefined) delete process.env.OPS_V2_VOUCHER_PACKET_ENABLED;
      else process.env.OPS_V2_VOUCHER_PACKET_ENABLED = prev;
    }
  })();
}

test('flag ON + hash matches → isStale=false', async () => {
  await withFlag('true', async () => {
    const { service } = makeService({
      packets: [{ id: 'packet-1', groupingKey: HOTEL_KEY, status: 'GENERATED', contentHash: MATCHING_HASH, snapshotJson: {} }],
    });
    const res = await service.getVoucherPacketGroups('bk-1', { companyId: 'c' });
    const hotel = res.groups.find((g: any) => g.groupingKey === HOTEL_KEY);
    assert.equal(hotel.existingPacketId, 'packet-1');
    assert.equal(hotel.isStale, false);
    assert.equal(hotel.orphaned, undefined);
  });
});

test('flag ON + stored hash differs (label/date/supplier/membership drift) → isStale=true', async () => {
  await withFlag('true', async () => {
    const { service } = makeService({
      packets: [{ id: 'packet-1', groupingKey: HOTEL_KEY, status: 'GENERATED', contentHash: 'stale-old-hash', snapshotJson: {} }],
    });
    const res = await service.getVoucherPacketGroups('bk-1', { companyId: 'c' });
    const hotel = res.groups.find((g: any) => g.groupingKey === HOTEL_KEY);
    assert.equal(hotel.isStale, true);
    assert.equal(hotel.packetStatus, 'GENERATED', 'status is NOT mutated to STALE');
  });
});

test('flag ON + no packet for group → isStale undefined (not generated)', async () => {
  await withFlag('true', async () => {
    const { service } = makeService({ packets: [] });
    const res = await service.getVoucherPacketGroups('bk-1', { companyId: 'c' });
    const hotel = res.groups.find((g: any) => g.groupingKey === HOTEL_KEY);
    assert.equal(hotel.existingPacketId, null);
    assert.equal(hotel.isStale, undefined);
  });
});

test('flag ON + packet whose group no longer exists → surfaced orphaned + isStale=true', async () => {
  await withFlag('true', async () => {
    const { service } = makeService({
      packets: [
        {
          id: 'packet-orphan',
          groupingKey: 'TRANSPORT:sup-9',
          status: 'GENERATED',
          contentHash: 'whatever',
          snapshotJson: {
            supplierId: 'sup-9',
            supplierName: 'Gone Transport Co',
            groupingType: 'TRANSPORT',
            dateRange: { start: '2026-10-02', end: '2026-10-02' },
            dayNumbers: [2],
            serviceCount: 1,
            services: [{ id: 'gone-1', label: 'Airport transfer' }],
          },
        },
      ],
    });
    const res = await service.getVoucherPacketGroups('bk-1', { companyId: 'c' });
    const orphan = res.groups.find((g: any) => g.groupingKey === 'TRANSPORT:sup-9');
    assert.ok(orphan, 'orphaned packet surfaced');
    assert.equal(orphan.orphaned, true);
    assert.equal(orphan.isStale, true);
    assert.equal(orphan.existingPacketId, 'packet-orphan');
    assert.equal(orphan.supplierName, 'Gone Transport Co');
    assert.deepEqual(orphan.memberLabels, ['Airport transfer']);
  });
});

test('flag OFF → no packet read, no stale/packet metadata exposed', async () => {
  await withFlag(null, async () => {
    const { service, calls } = makeService({
      packets: [{ id: 'packet-1', groupingKey: HOTEL_KEY, status: 'GENERATED', contentHash: 'x', snapshotJson: {} }],
    });
    const res = await service.getVoucherPacketGroups('bk-1', { companyId: 'c' });
    const hotel = res.groups.find((g: any) => g.groupingKey === HOTEL_KEY);
    assert.equal(hotel.existingPacketId, undefined, 'no packet id when flag off');
    assert.equal(hotel.isStale, undefined, 'no stale flag when flag off');
    assert.equal(calls.findMany, 0, 'packets not read when flag off (fail-closed)');
  });
});
