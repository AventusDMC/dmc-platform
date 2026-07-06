import test = require('node:test');
import assert = require('node:assert/strict');

const { BookingsService } = require('./bookings.service');
const { computeVoucherPacketContentHash } = require('./voucher-packet-generate');

/**
 * Supplier Voucher Packet V2 — S7 send-preview service tests (Prisma-mock).
 * Flag-gated + fail-closed; recipient resolved from the packet supplier only;
 * read-only (mutation traps prove no writes/audit/status/PDF/send).
 */

const HOTEL_KEY = 'HOTEL:sup-1:2026-10-01';
const companyActor = { companyId: 'dmc-company' };

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
  const trap = (n: string) => async () => {
    throw new Error(`MUTATION not allowed: ${n}`);
  };
  const prisma = {
    voucherPacket: {
      findFirst: async () =>
        opts.noPacket
          ? null
          : {
              id: 'packet-1',
              status: opts.packetStatus ?? 'GENERATED',
              groupingKey: HOTEL_KEY,
              supplierId: opts.supplierId === undefined ? 'sup-1' : opts.supplierId,
              contentHash: MATCHING_HASH,
              snapshotJson: { serviceCount: 1, services: [{ id: 'h1', label: 'Hotel A stay' }] },
            },
      create: trap('voucherPacket.create'),
      update: trap('voucherPacket.update'),
      delete: trap('voucherPacket.delete'),
    },
    supplier: {
      findUnique: async () =>
        opts.supplier === undefined
          ? { id: 'sup-1', name: 'Hotel A', email: 'email' in opts ? opts.email : 'ops@supplier.example' }
          : opts.supplier,
    },
    voucherPacketItem: { create: trap('item.create'), deleteMany: trap('item.deleteMany'), update: trap('item.update') },
    voucher: { findFirst: trap('voucher.findFirst') },
    bookingAuditLog: { create: trap('bookingAuditLog.create') },
  };
  const service = new BookingsService(
    prisma,
    { log: async () => null },
    { log: async () => null },
    { checkBookingHotelAllotmentAvailability: async () => ({ blockers: [], warnings: [] }) },
  );
  service.findOne = async () => (opts.noBooking ? null : mockBooking());
  return service;
}

function withEnv(env: Record<string, string | null>, fn: () => Promise<void>) {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    prev[k] = process.env[k];
    if (v === null) delete process.env[k];
    else process.env[k] = v;
  }
  return (async () => {
    try {
      await fn();
    } finally {
      for (const k of Object.keys(env)) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    }
  })();
}

test('flag OFF → Forbidden, before any read', async () => {
  await withEnv({ OPS_V2_VOUCHER_PACKET_ENABLED: null }, async () => {
    const service = makeService();
    await assert.rejects(
      () => service.getVoucherPacketSendPreview('bk-1', 'packet-1', companyActor),
      /not enabled/i,
    );
  });
});

test('flag ON → READY, recipient from the packet supplier, read-only', async () => {
  await withEnv(
    {
      OPS_V2_VOUCHER_PACKET_ENABLED: 'true',
      OPS_V2_VOUCHER_SEND_ENABLED: 'true',
      OPS_V2_VOUCHER_SEND_RECIPIENT_ALLOWLIST: 'ops@supplier.example',
    },
    async () => {
      const service = makeService();
      const p = await service.getVoucherPacketSendPreview('bk-1', 'packet-1', companyActor);
      assert.equal(p.readiness, 'READY');
      assert.equal(p.supplierName, 'Hotel A');
      assert.equal(p.recipientEmail, 'ops@supplier.example');
      assert.equal(p.note, 'Preview only. No email is sent.');
    },
  );
});

test('flag ON + send disabled → SEND_DISABLED blocker', async () => {
  await withEnv(
    { OPS_V2_VOUCHER_PACKET_ENABLED: 'true', OPS_V2_VOUCHER_SEND_ENABLED: null, OPS_V2_VOUCHER_SEND_RECIPIENT_ALLOWLIST: 'ops@supplier.example' },
    async () => {
      const service = makeService();
      const p = await service.getVoucherPacketSendPreview('bk-1', 'packet-1', companyActor);
      assert.equal(p.readiness, 'SEND_DISABLED');
    },
  );
});

test('flag ON + supplier not allowlisted → RECIPIENT_NOT_ALLOWLISTED', async () => {
  await withEnv(
    { OPS_V2_VOUCHER_PACKET_ENABLED: 'true', OPS_V2_VOUCHER_SEND_ENABLED: 'true', OPS_V2_VOUCHER_SEND_RECIPIENT_ALLOWLIST: 'ziad@axisdmc.com' },
    async () => {
      const service = makeService();
      const p = await service.getVoucherPacketSendPreview('bk-1', 'packet-1', companyActor);
      assert.equal(p.readiness, 'RECIPIENT_NOT_ALLOWLISTED');
      assert.equal(p.recipientEmail, 'ops@supplier.example');
    },
  );
});

test('flag ON + no supplier email → MISSING_EMAIL', async () => {
  await withEnv({ OPS_V2_VOUCHER_PACKET_ENABLED: 'true', OPS_V2_VOUCHER_SEND_ENABLED: 'true' }, async () => {
    const service = makeService({ email: null });
    const p = await service.getVoucherPacketSendPreview('bk-1', 'packet-1', companyActor);
    assert.equal(p.readiness, 'MISSING_EMAIL');
  });
});

test('packet not found → NotFound', async () => {
  await withEnv({ OPS_V2_VOUCHER_PACKET_ENABLED: 'true' }, async () => {
    const service = makeService({ noPacket: true });
    await assert.rejects(
      () => service.getVoucherPacketSendPreview('bk-1', 'nope', companyActor),
      /voucher packet not found/i,
    );
  });
});

test('missing booking → NotFound', async () => {
  await withEnv({ OPS_V2_VOUCHER_PACKET_ENABLED: 'true' }, async () => {
    const service = makeService({ noBooking: true });
    await assert.rejects(
      () => service.getVoucherPacketSendPreview('bk-1', 'packet-1', companyActor),
      /booking not found/i,
    );
  });
});
