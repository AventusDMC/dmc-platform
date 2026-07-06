import test = require('node:test');
import assert = require('node:assert/strict');

const { BookingsService } = require('./bookings.service');

/**
 * Supplier Voucher Packet V2 — S5 groups-endpoint enrichment tests.
 * getVoucherPacketGroups annotates each group with existingPacketId + packetStatus
 * ONLY when OPS_V2_VOUCHER_PACKET_ENABLED is ON. Read-only (mutation traps).
 */

const HOTEL_KEY = 'HOTEL:sup-1:2026-10-01';

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
  };
  const service = new BookingsService(
    prisma,
    { log: async () => null },
    { log: async () => null },
    { checkBookingHotelAllotmentAvailability: async () => ({ blockers: [], warnings: [] }) },
  );
  service.findOne = async () => mockBooking();
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

test('flag ON + packet exists → group carries existingPacketId + packetStatus', async () => {
  await withFlag('true', async () => {
    const { service, calls } = makeService({
      packets: [{ id: 'packet-1', groupingKey: HOTEL_KEY, status: 'GENERATED' }],
    });
    const res = await service.getVoucherPacketGroups('bk-1', { companyId: 'c' });
    const hotel = res.groups.find((g: any) => g.groupingKey === HOTEL_KEY);
    assert.equal(hotel.existingPacketId, 'packet-1');
    assert.equal(hotel.packetStatus, 'GENERATED');
    assert.equal(calls.findMany, 1, 'read the packets once');
  });
});

test('flag ON + no packet → existingPacketId null', async () => {
  await withFlag('true', async () => {
    const { service } = makeService({ packets: [] });
    const res = await service.getVoucherPacketGroups('bk-1', { companyId: 'c' });
    const hotel = res.groups.find((g: any) => g.groupingKey === HOTEL_KEY);
    assert.equal(hotel.existingPacketId, null);
    assert.equal(hotel.packetStatus, null);
  });
});

test('flag OFF → no packet read, no existingPacketId exposed', async () => {
  await withFlag(null, async () => {
    const { service, calls } = makeService({
      packets: [{ id: 'packet-1', groupingKey: HOTEL_KEY, status: 'GENERATED' }],
    });
    const res = await service.getVoucherPacketGroups('bk-1', { companyId: 'c' });
    const hotel = res.groups.find((g: any) => g.groupingKey === HOTEL_KEY);
    assert.equal(hotel.existingPacketId, undefined, 'no packet id exposed when flag off');
    assert.equal(calls.findMany, 0, 'packets not read when flag off (fail-closed)');
  });
});
