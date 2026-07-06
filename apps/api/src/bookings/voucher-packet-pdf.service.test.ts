import test = require('node:test');
import assert = require('node:assert/strict');

const { BookingsService } = require('./bookings.service');

/**
 * Supplier Voucher Packet V2 — S4 packet PDF service tests (Prisma-mock).
 * Exercises the real generateVoucherPacketPdf. Any mutation call trips a trap,
 * proving the path is read-only.
 */

const companyActor = { companyId: 'dmc-company' };

function samplePacket() {
  return {
    id: 'packet-1',
    status: 'GENERATED',
    generatedAt: new Date('2026-07-06T00:00:00.000Z'),
    snapshotJson: {
      supplierName: 'TEST Hotel Supplier A',
      groupingType: 'HOTEL',
      groupingKey: 'HOTEL:sup-1:2026-07-22',
      bookingRef: 'BK-2026-0002',
      dateRange: { start: '2026-07-22', end: '2026-07-22' },
      serviceCount: 1,
      services: [{ id: 'h1', serviceType: 'HOTEL', serviceDate: '2026-07-22', dayNumber: 1, label: 'QA Hotel Service' }],
    },
  };
}

function makeService(opts: any = {}) {
  const calls = { findFirst: 0 };
  const trap = (name: string) => async () => {
    throw new Error(`MUTATION not allowed in S4 PDF path: ${name}`);
  };
  const prisma = {
    voucherPacket: {
      findFirst: async () => {
        calls.findFirst++;
        return opts.packet ?? null;
      },
      create: trap('voucherPacket.create'),
      update: trap('voucherPacket.update'),
      delete: trap('voucherPacket.delete'),
    },
    voucherPacketItem: { create: trap('voucherPacketItem.create') },
    bookingAuditLog: { create: trap('bookingAuditLog.create') },
    $transaction: trap('$transaction'),
  };
  const service = new BookingsService(
    prisma,
    { log: async () => null },
    { log: async () => null },
    { checkBookingHotelAllotmentAvailability: async () => ({ blockers: [], warnings: [] }) },
  );
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

test('flag OFF → Forbidden, before any read', async () => {
  await withFlag(null, async () => {
    const { service, calls } = makeService({ packet: samplePacket() });
    await assert.rejects(
      () => service.generateVoucherPacketPdf('bk-1', 'packet-1', companyActor),
      /not enabled/i,
    );
    assert.equal(calls.findFirst, 0, 'flag is checked before the packet read');
  });
});

test('flag ON + packet found → PDF buffer, read-only (no mutation)', async () => {
  await withFlag('true', async () => {
    const { service, calls } = makeService({ packet: samplePacket() });
    const buf = await service.generateVoucherPacketPdf('bk-1', 'packet-1', companyActor);
    assert.ok(Buffer.isBuffer(buf));
    assert.equal(buf.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.equal(calls.findFirst, 1, 'exactly one read; the mutation traps never fired');
  });
});

test('flag ON + packet missing → NotFound', async () => {
  await withFlag('true', async () => {
    const { service } = makeService({ packet: null });
    await assert.rejects(
      () => service.generateVoucherPacketPdf('bk-1', 'nope', companyActor),
      /not found/i,
    );
  });
});
