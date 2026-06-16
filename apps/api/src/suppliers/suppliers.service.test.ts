import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { SuppliersService } from './suppliers.service';

// PR12B-3A — Supplier.baseCity capture (metadata only; driver-overnight eval is PR 12C).
// Fake prisma captures the create/update `data` payload. No pricing/recalc anywhere.
function createService(existing: any = { id: 'sup-1', name: 'Alpha', type: 'transport' }) {
  const writes: { create?: any; update?: any } = {};
  const prisma: any = {
    supplier: {
      findUnique: async () => existing,
      create: async ({ data }: any) => { writes.create = data; return { id: 'sup-1', ...data }; },
      update: async ({ data }: any) => { writes.update = data; return { ...existing, ...data }; },
    },
  };
  return { service: new SuppliersService(prisma as any), writes };
}
const UPDATE_KEYS = new Set(['name', 'type', 'email', 'phone', 'notes', 'transportDiscountPercent', 'baseCity']);

test('PR12B-3A supplier: saves baseCity', async () => {
  const { service, writes } = createService();
  await service.update('sup-1', { baseCity: 'Amman' });
  assert.equal(writes.update.baseCity, 'Amman');
});

test('PR12B-3A supplier: clears baseCity to null', async () => {
  const { service, writes } = createService({ id: 'sup-1', name: 'Alpha', type: 'transport', baseCity: 'Amman' });
  await service.update('sup-1', { baseCity: null });
  assert.equal(writes.update.baseCity, null);
});

test('PR12B-3A supplier: blank baseCity saves null; long value capped at 120', async () => {
  const a = createService();
  await a.service.update('sup-1', { baseCity: '   ' });
  assert.equal(a.writes.update.baseCity, null);
  const b = createService();
  await b.service.update('sup-1', { baseCity: 'x'.repeat(200) });
  assert.equal(b.writes.update.baseCity.length, 120);
});

test('PR12B-3A supplier: omitted baseCity remains unchanged (undefined → not written)', async () => {
  const { service, writes } = createService();
  await service.update('sup-1', { name: 'Alpha 2' });
  assert.equal(writes.update.baseCity, undefined); // undefined → Prisma leaves column unchanged
});

test('PR12B-3A supplier: update writes only approved keys (no pricing/quote fields)', async () => {
  const { service, writes } = createService();
  await service.update('sup-1', { baseCity: 'Aqaba', name: 'Alpha' });
  for (const key of Object.keys(writes.update)) {
    assert.ok(UPDATE_KEYS.has(key), `unexpected supplier write key: ${key}`);
  }
});

test('PR12B-3A supplier: create persists baseCity (and null when blank)', async () => {
  const a = createService();
  await a.service.create({ name: 'New', type: 'transport', baseCity: 'Petra' } as any);
  assert.equal(a.writes.create.baseCity, 'Petra');
  const b = createService();
  await b.service.create({ name: 'New', type: 'transport' } as any);
  assert.equal(b.writes.create.baseCity, null);
});
