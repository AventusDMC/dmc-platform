import test = require('node:test');
import assert = require('node:assert/strict');

const { BookingsService } = require('./bookings.service');

/**
 * Supplier Voucher Packet V2 — S3 generate service tests (Prisma-mock).
 * Exercises the real generateVoucherPacket against a mock $transaction; findOne
 * is stubbed to return a fixed booking. Asserts flag gating, row creation,
 * snapshots, audit, guards, and single-service-voucher isolation.
 */

const HOTEL_KEY = 'HOTEL:sup-1:2026-10-01';
const actor = { userId: 'user-1', label: 'DMC Admin' };
const companyActor = { companyId: 'dmc-company' };

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
        operationType: 'HOTEL',
        serviceDate: new Date('2026-10-01T00:00:00.000Z'),
        bookingDayId: 'd1',
        nights: 2,
        description: 'Hotel A stay',
      },
      // UNASSIGNED — must be excluded from any packet.
      {
        id: 'u1',
        assignedSupplierId: 'sup-2',
        assignmentStatus: 'UNASSIGNED',
        serviceType: 'TRANSPORT',
        description: 'Transfer',
      },
    ],
  };
}

function makeService(captured: any, opts: any = {}) {
  const tx = {
    voucherPacket: {
      findFirst: async () => opts.existingPacket ?? null,
      create: async ({ data }: any) => {
        captured.packet = data;
        return { id: 'packet-1', ...data };
      },
    },
    voucherPacketItem: {
      findFirst: async () => opts.serviceInPacket ?? null,
      create: async ({ data }: any) => {
        (captured.items ||= []).push(data);
        return { id: 'item-' + data.bookingServiceId, ...data };
      },
    },
    voucher: { findFirst: async () => opts.serviceHasVoucher ?? null },
    bookingAuditLog: {
      create: async ({ data }: any) => {
        (captured.audits ||= []).push(data);
        return data;
      },
    },
  };
  const prisma = { $transaction: async (cb: any) => cb(tx) };
  const service = new BookingsService(
    prisma,
    { log: async () => null },
    { log: async () => null },
    { checkBookingHotelAllotmentAvailability: async () => ({ blockers: [], warnings: [] }) },
  );
  service.findOne = async () => (opts.noBooking ? null : mockBooking());
  return service;
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

test('flag OFF: rejects and writes nothing', async () => {
  await withFlag(null, async () => {
    const captured: any = {};
    const service = makeService(captured);
    await assert.rejects(
      () => service.generateVoucherPacket('bk-1', { groupingKey: HOTEL_KEY, actor, companyActor }),
      /not enabled/i,
    );
    assert.equal(captured.packet, undefined, 'no packet written');
    assert.equal(captured.items, undefined, 'no items written');
    assert.equal(captured.audits, undefined, 'no audit written');
  });
});

test('flag ON: creates 1 VoucherPacket + N items + audits; unassigned excluded', async () => {
  await withFlag('true', async () => {
    const captured: any = {};
    const service = makeService(captured);
    const packet = await service.generateVoucherPacket('bk-1', { groupingKey: HOTEL_KEY, actor, companyActor });

    assert.equal(packet.id, 'packet-1');
    // one packet
    assert.equal(captured.packet.status, 'GENERATED');
    assert.equal(captured.packet.bookingId, 'bk-1');
    assert.equal(captured.packet.supplierId, 'sup-1');
    assert.equal(captured.packet.groupingType, 'HOTEL');
    assert.equal(captured.packet.groupingKey, HOTEL_KEY);
    assert.match(captured.packet.contentHash, /^[0-9a-f]{64}$/);
    assert.ok(captured.packet.generatedAt instanceof Date);
    assert.equal(captured.packet.generatedBy, 'user-1');
    // one item — only the ASSIGNED hotel service (u1 excluded)
    assert.equal(captured.items.length, 1);
    assert.equal(captured.items[0].bookingServiceId, 'h1');
    assert.equal(captured.items[0].packetId, 'packet-1');
    // audit: 1 per-service inclusion + 1 packet-level
    const actions = captured.audits.map((a: any) => a.action).sort();
    assert.deepEqual(actions, ['voucher_packet_generated', 'voucher_packet_service_included']);
  });
});

test('flag ON: snapshots + audit are PII-free and finance-free', async () => {
  await withFlag('true', async () => {
    const captured: any = {};
    const service = makeService(captured);
    await service.generateVoucherPacket('bk-1', { groupingKey: HOTEL_KEY, actor, companyActor });
    const blob = JSON.stringify({ packet: captured.packet, items: captured.items, audits: captured.audits });
    for (const forbidden of ['unitCost', 'unitSell', 'totalCost', 'totalSell', 'margin', 'payable', 'passport', 'dateOfBirth']) {
      assert.ok(!blob.includes(forbidden), `leaked ${forbidden}`);
    }
    assert.ok(blob.includes('Hotel A'), 'supplier name present (identity, not PII/finance)');
  });
});

test('group not found → NotFound; nothing written', async () => {
  await withFlag('true', async () => {
    const captured: any = {};
    const service = makeService(captured);
    await assert.rejects(
      () => service.generateVoucherPacket('bk-1', { groupingKey: 'HOTEL:sup-9:2099-01-01', actor, companyActor }),
      /group not found/i,
    );
    assert.equal(captured.packet, undefined);
  });
});

test('duplicate packet for same booking/key → Conflict', async () => {
  await withFlag('true', async () => {
    const captured: any = {};
    const service = makeService(captured, { existingPacket: { id: 'existing' } });
    await assert.rejects(
      () => service.generateVoucherPacket('bk-1', { groupingKey: HOTEL_KEY, actor, companyActor }),
      /already exists/i,
    );
    assert.equal(captured.packet, undefined, 'no create on duplicate');
  });
});

test('service already in another packet → Conflict', async () => {
  await withFlag('true', async () => {
    const captured: any = {};
    const service = makeService(captured, { serviceInPacket: { id: 'other-item' } });
    await assert.rejects(
      () => service.generateVoucherPacket('bk-1', { groupingKey: HOTEL_KEY, actor, companyActor }),
      /already included in another voucher packet/i,
    );
    assert.equal(captured.packet, undefined);
  });
});

test('service already has a standalone Voucher → Conflict', async () => {
  await withFlag('true', async () => {
    const captured: any = {};
    const service = makeService(captured, { serviceHasVoucher: { id: 'v-1' } });
    await assert.rejects(
      () => service.generateVoucherPacket('bk-1', { groupingKey: HOTEL_KEY, actor, companyActor }),
      /single-service voucher/i,
    );
    assert.equal(captured.packet, undefined);
  });
});

test('missing booking → NotFound', async () => {
  await withFlag('true', async () => {
    const captured: any = {};
    const service = makeService(captured, { noBooking: true });
    await assert.rejects(
      () => service.generateVoucherPacket('bk-1', { groupingKey: HOTEL_KEY, actor, companyActor }),
      /booking not found/i,
    );
  });
});
