import test = require('node:test');
import assert = require('node:assert/strict');

const { BookingsService } = require('./bookings.service');

/**
 * Supplier Voucher Packet V2 — S6 regenerate service tests (Prisma-mock).
 * Exercises the real regenerateVoucherPacket against a mock $transaction; findOne
 * and the packet load are stubbed. Asserts flag gating, in-place update (same
 * packetId), item replacement, contentHash/generatedAt/generatedBy refresh, status
 * staying GENERATED, packet + per-service audits, guards, and no PDF/send behavior.
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
      // UNASSIGNED — never part of any packet.
      { id: 'u1', assignedSupplierId: 'sup-2', assignmentStatus: 'UNASSIGNED', serviceType: 'TRANSPORT', description: 'Transfer' },
    ],
  };
}

function makeService(captured: any, opts: any = {}) {
  const tx = {
    voucherPacketItem: {
      findFirst: async () => opts.serviceInOtherPacket ?? null,
      findMany: async () => opts.oldItems ?? [{ bookingServiceId: 'h1' }],
      deleteMany: async ({ where }: any) => {
        captured.deletedFor = where.packetId;
        return { count: (opts.oldItems ?? [{ bookingServiceId: 'h1' }]).length };
      },
      create: async ({ data }: any) => {
        (captured.items ||= []).push(data);
        return { id: 'item-' + data.bookingServiceId, ...data };
      },
    },
    voucher: { findFirst: async () => opts.serviceHasVoucher ?? null },
    voucherPacket: {
      update: async ({ where, data }: any) => {
        captured.updateWhere = where;
        captured.update = data;
        return { id: where.id, status: 'GENERATED', ...data };
      },
    },
    bookingAuditLog: {
      create: async ({ data }: any) => {
        (captured.audits ||= []).push(data);
        return data;
      },
    },
  };
  const prisma = {
    voucherPacket: {
      findFirst: async () =>
        opts.noPacket
          ? null
          : { id: 'packet-1', groupingKey: opts.groupingKey ?? HOTEL_KEY, status: 'GENERATED' },
    },
    $transaction: async (cb: any) => cb(tx),
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
      () => service.regenerateVoucherPacket('bk-1', { packetId: 'packet-1', actor, companyActor }),
      /not enabled/i,
    );
    assert.equal(captured.update, undefined, 'no update written');
    assert.equal(captured.items, undefined, 'no items written');
    assert.equal(captured.audits, undefined, 'no audit written');
  });
});

test('flag ON: updates same packetId, refreshes contentHash/generatedAt/By, status stays GENERATED', async () => {
  await withFlag('true', async () => {
    const captured: any = {};
    const service = makeService(captured);
    const result = await service.regenerateVoucherPacket('bk-1', { packetId: 'packet-1', actor, companyActor });

    assert.equal(result.id, 'packet-1', 'same packetId kept');
    assert.equal(captured.updateWhere.id, 'packet-1');
    assert.match(captured.update.contentHash, /^[0-9a-f]{64}$/);
    assert.ok(captured.update.generatedAt instanceof Date);
    assert.equal(captured.update.generatedBy, 'user-1');
    assert.equal(captured.update.status, undefined, 'status is NOT changed (stays GENERATED)');
    // items replaced in place for the current member (h1); unassigned u1 excluded
    assert.equal(captured.deletedFor, 'packet-1', 'old items deleted for this packet');
    assert.equal(captured.items.length, 1);
    assert.equal(captured.items[0].bookingServiceId, 'h1');
    assert.equal(captured.items[0].packetId, 'packet-1');
  });
});

test('flag ON (no membership change): only the packet-level regenerate audit', async () => {
  await withFlag('true', async () => {
    const captured: any = {};
    const service = makeService(captured, { oldItems: [{ bookingServiceId: 'h1' }] });
    await service.regenerateVoucherPacket('bk-1', { packetId: 'packet-1', actor, companyActor });
    const actions = captured.audits.map((a: any) => a.action);
    assert.deepEqual(actions, ['voucher_packet_regenerated']);
    assert.equal(captured.audits[0].entityId, 'packet-1');
    assert.equal(captured.audits[0].note, HOTEL_KEY);
  });
});

test('flag ON: added + removed members emit per-service inclusion/removal audits', async () => {
  await withFlag('true', async () => {
    const captured: any = {};
    // old had a since-removed service (x-old) and did NOT have the current h1.
    const service = makeService(captured, { oldItems: [{ bookingServiceId: 'x-old' }] });
    await service.regenerateVoucherPacket('bk-1', { packetId: 'packet-1', actor, companyActor });
    const byAction = captured.audits.reduce((m: any, a: any) => ((m[a.action] ||= []).push(a), m), {});
    assert.equal(byAction['voucher_packet_service_included'].length, 1, 'h1 newly included');
    assert.equal(byAction['voucher_packet_service_included'][0].entityId, 'h1');
    assert.equal(byAction['voucher_packet_service_removed'].length, 1, 'x-old removed');
    assert.equal(byAction['voucher_packet_service_removed'][0].entityId, 'x-old');
    assert.equal(byAction['voucher_packet_regenerated'].length, 1);
  });
});

test('flag ON: snapshots + audits are PII-free and finance-free', async () => {
  await withFlag('true', async () => {
    const captured: any = {};
    const service = makeService(captured);
    await service.regenerateVoucherPacket('bk-1', { packetId: 'packet-1', actor, companyActor });
    const blob = JSON.stringify({ update: captured.update, items: captured.items, audits: captured.audits });
    for (const forbidden of ['unitCost', 'unitSell', 'totalCost', 'totalSell', 'margin', 'payable', 'passport', 'dateOfBirth']) {
      assert.ok(!blob.includes(forbidden), `leaked ${forbidden}`);
    }
  });
});

test('group no longer exists (orphaned) → Conflict; nothing written', async () => {
  await withFlag('true', async () => {
    const captured: any = {};
    const service = makeService(captured, { groupingKey: 'HOTEL:sup-9:2099-01-01' });
    await assert.rejects(
      () => service.regenerateVoucherPacket('bk-1', { packetId: 'packet-1', actor, companyActor }),
      /no longer exists/i,
    );
    assert.equal(captured.update, undefined);
  });
});

test('double-coverage: a member in another packet → Conflict', async () => {
  await withFlag('true', async () => {
    const captured: any = {};
    const service = makeService(captured, { serviceInOtherPacket: { id: 'other-item' } });
    await assert.rejects(
      () => service.regenerateVoucherPacket('bk-1', { packetId: 'packet-1', actor, companyActor }),
      /already included in another voucher packet/i,
    );
    assert.equal(captured.update, undefined);
  });
});

test('double-coverage: a member has a standalone Voucher → Conflict', async () => {
  await withFlag('true', async () => {
    const captured: any = {};
    const service = makeService(captured, { serviceHasVoucher: { id: 'v-1' } });
    await assert.rejects(
      () => service.regenerateVoucherPacket('bk-1', { packetId: 'packet-1', actor, companyActor }),
      /single-service voucher/i,
    );
    assert.equal(captured.update, undefined);
  });
});

test('packet not found → NotFound', async () => {
  await withFlag('true', async () => {
    const captured: any = {};
    const service = makeService(captured, { noPacket: true });
    await assert.rejects(
      () => service.regenerateVoucherPacket('bk-1', { packetId: 'nope', actor, companyActor }),
      /voucher packet not found/i,
    );
    assert.equal(captured.update, undefined);
  });
});

test('missing booking → NotFound', async () => {
  await withFlag('true', async () => {
    const captured: any = {};
    const service = makeService(captured, { noBooking: true });
    await assert.rejects(
      () => service.regenerateVoucherPacket('bk-1', { packetId: 'packet-1', actor, companyActor }),
      /booking not found/i,
    );
    assert.equal(captured.update, undefined);
  });
});
