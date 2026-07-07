import test = require('node:test');
import assert = require('node:assert/strict');

const { CatalogService } = require('./catalog.service');

/**
 * Product Catalog V2 — Slice 1 service tests (Prisma-mock).
 * Flag OFF → fail-closed before ANY read; flag ON → summary; role redaction;
 * mutation traps prove no writes/audit.
 */

function makeService() {
  const calls = { reads: 0 };
  const trap = (n: string) => async () => {
    throw new Error(`MUTATION not allowed: ${n}`);
  };
  const reader = (rows: any[]) => async () => {
    calls.reads++;
    return rows;
  };
  const model = (rows: any[]) => ({
    findMany: reader(rows),
    count: async () => {
      calls.reads++;
      return rows.length;
    },
    create: trap('create'),
    update: trap('update'),
    updateMany: trap('updateMany'),
    delete: trap('delete'),
    deleteMany: trap('deleteMany'),
    upsert: trap('upsert'),
  });
  const prisma = {
    supplier: model([
      { id: 'sup-1', name: 'S1', type: 'transport', email: 'ops@supplier.example', phone: null, baseCity: 'Amman', transportDiscountPercent: 25 },
    ]),
    supplierService: model([
      { id: 'sv1', resolvedSupplierId: 'sup-1', supplierId: null, name: 'X', category: 'c', currency: 'JOD', baseCost: 10, serviceType: { isActive: true } },
    ]),
    serviceRate: model([{ serviceId: 'sv1', resolvedSupplierId: 'sup-1', supplierId: null, costCurrency: 'JOD', costBaseAmount: 8 }]),
    transportContract: model([{ supplierId: 'sup-1', currency: 'JOD', validFrom: new Date('2026-01-01'), validTo: new Date('2027-01-01'), active: true }]),
    vehicleRate: model([{ supplierId: 'sup-1', currency: 'JOD' }]),
    hotelContract: model([{ id: 'h1', name: 'C', validFrom: new Date('2026-01-01'), validTo: new Date('2027-01-01'), currency: 'USD', confidence: 'VERIFIED', hotel: { name: 'Hotel A' } }]),
    activity: model([{ active: true }, { active: false }]),
    guide: model([{ active: true }]),
    restaurant: model([{ active: true }]),
    bookingAuditLog: { create: trap('bookingAuditLog.create') },
  };
  return { service: new CatalogService(prisma), calls };
}

function withFlag(value: string | null, fn: () => Promise<void>) {
  const prev = process.env.CATALOG_V2_ENABLED;
  if (value === null) delete process.env.CATALOG_V2_ENABLED;
  else process.env.CATALOG_V2_ENABLED = value;
  return (async () => {
    try {
      await fn();
    } finally {
      if (prev === undefined) delete process.env.CATALOG_V2_ENABLED;
      else process.env.CATALOG_V2_ENABLED = prev;
    }
  })();
}

test('flag OFF → Forbidden, before ANY read', async () => {
  await withFlag(null, async () => {
    const { service, calls } = makeService();
    await assert.rejects(() => service.getV2Summary('admin'), /not enabled/i);
    assert.equal(calls.reads, 0, 'no data read when flag off (fail-closed)');
  });
});

test('flag ON → read-only summary with expected sections', async () => {
  await withFlag('true', async () => {
    const { service, calls } = makeService();
    const res = await service.getV2Summary('admin');
    assert.ok(calls.reads > 0, 'reads happened');
    assert.equal(res.suppliers.length, 1);
    assert.equal(res.hotelContracts.length, 1);
    assert.equal(res.serviceCatalog.activities, 2);
    assert.equal(res.serviceCatalog.activitiesActive, 1);
    assert.equal(res.note, 'Read-only summary. No changes are made.');
    assert.ok(res.warningCounts && typeof res.meta.counts.totalWarnings === 'number');
  });
});

test('flag ON + each ALLOWED internal role → summary, pricing visible, read-only', async () => {
  await withFlag('true', async () => {
    for (const role of ['admin', 'operations', 'super_admin', 'finance']) {
      const { service } = makeService();
      const res = await service.getV2Summary(role);
      assert.equal(res.meta.pricingRedacted, false, role);
      assert.ok(res.suppliers[0].pricing, `${role} sees pricing`);
    }
  });
});

test('flag ON + BLOCKED role (agent / viewer / agent_admin) → Forbidden, before any read', async () => {
  await withFlag('true', async () => {
    for (const role of ['agent', 'viewer', 'agent_admin']) {
      const { service, calls } = makeService();
      await assert.rejects(() => service.getV2Summary(role), /restricted to internal roles/i, role);
      assert.equal(calls.reads, 0, `${role} blocked before any read`);
    }
  });
});

test('flag ON + null role → Forbidden (fail-safe), before any read', async () => {
  await withFlag('true', async () => {
    const { service, calls } = makeService();
    await assert.rejects(() => service.getV2Summary(null), /restricted to internal roles/i);
    assert.equal(calls.reads, 0);
  });
});

test('flag OFF takes precedence over role gate (flag checked first)', async () => {
  await withFlag(null, async () => {
    const { service, calls } = makeService();
    // even an allowed role gets the flag error first
    await assert.rejects(() => service.getV2Summary('admin'), /not enabled/i);
    assert.equal(calls.reads, 0);
  });
});
