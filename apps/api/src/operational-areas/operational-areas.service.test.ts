import test from 'node:test';
import assert from 'node:assert/strict';

import { OperationalAreasService, normalizeAreaCode, OPERATIONAL_AREA_TYPES } from './operational-areas.service';

// Operational Areas Catalog v1 — service-level tests for the DB-backed
// CRUD that powers the Route Builder + Canonical Builder + Touring
// Routes + Dispatch + Transfers + Excursion composition.

function buildFakePrisma(initial: Array<any> = []) {
  const store = [...initial];
  return {
    operationalArea: {
      findMany: async (args?: any) => {
        const where = args?.where || {};
        let rows = [...store];
        if (where.isActive !== undefined) {
          rows = rows.filter((r) => Boolean(r.isActive) === Boolean(where.isActive));
        }
        if (where.type) rows = rows.filter((r) => r.type === where.type);
        if (where.OR) {
          rows = rows.filter((r) =>
            (where.OR as any[]).some((clause: any) => {
              for (const [key, condition] of Object.entries(clause)) {
                const c = condition as any;
                if (c?.contains && typeof r[key] === 'string') {
                  if (!r[key].toLowerCase().includes(c.contains.toLowerCase())) return false;
                }
              }
              return true;
            }),
          );
        }
        if (where.city?.equals) {
          rows = rows.filter((r) => r.city.toLowerCase() === where.city.equals.toLowerCase());
        }
        return rows;
      },
      findUnique: async ({ where }: any) =>
        store.find((r) => (where.id ? r.id === where.id : r.code === where.code)) || null,
      create: async ({ data }: any) => {
        if (store.some((r) => r.code === data.code)) {
          const err: any = new Error('Unique constraint');
          err.code = 'P2002';
          throw err;
        }
        const created = { id: `id-${store.length + 1}`, ...data, isActive: data.isActive ?? true };
        store.push(created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const idx = store.findIndex((r) => r.id === where.id);
        if (idx < 0) throw new Error('not found');
        if (data.code && store.some((r, i) => i !== idx && r.code === data.code)) {
          const err: any = new Error('Unique constraint');
          err.code = 'P2002';
          throw err;
        }
        store[idx] = { ...store[idx], ...data };
        return store[idx];
      },
    },
    __store: store,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
test('normalizeAreaCode: UPPER_SNAKE_CASE + trims + replaces spaces/hyphens', () => {
  assert.equal(normalizeAreaCode('amm pet'), 'AMM_PET');
  assert.equal(normalizeAreaCode('amm-pet'), 'AMM_PET');
  assert.equal(normalizeAreaCode('  amm  '), 'AMM');
  assert.equal(normalizeAreaCode(null), '');
});

test('OPERATIONAL_AREA_TYPES covers every type called out in the spec', () => {
  assert.ok(OPERATIONAL_AREA_TYPES.includes('CITY'));
  assert.ok(OPERATIONAL_AREA_TYPES.includes('AIRPORT'));
  assert.ok(OPERATIONAL_AREA_TYPES.includes('BORDER'));
  assert.ok(OPERATIONAL_AREA_TYPES.includes('HOTEL_ZONE'));
  assert.ok(OPERATIONAL_AREA_TYPES.includes('TOURISM_SITE'));
  assert.ok(OPERATIONAL_AREA_TYPES.includes('CAMP_AREA'));
  assert.ok(OPERATIONAL_AREA_TYPES.includes('PORT'));
  assert.ok(OPERATIONAL_AREA_TYPES.includes('RESORT_AREA'));
});

// ---------------------------------------------------------------------------
// Service CRUD
// ---------------------------------------------------------------------------
test('create: stores normalized code + defaults isActive to true', async () => {
  const prisma = buildFakePrisma();
  const service = new OperationalAreasService(prisma as any);
  const created = await service.create({
    code: 'amm pet',
    name: 'Amman to Petra',
    type: 'CITY',
    city: 'Amman',
  });
  assert.equal(created.code, 'AMM_PET');
  assert.equal(created.isActive, true);
  assert.equal(created.country, 'Jordan');
});

test('create: rejects duplicate codes with a clean BadRequest', async () => {
  const prisma = buildFakePrisma();
  const service = new OperationalAreasService(prisma as any);
  await service.create({ code: 'AMM', name: 'Amman City', type: 'CITY', city: 'Amman' });
  await assert.rejects(
    () => service.create({ code: 'AMM', name: 'Different Amman', type: 'CITY', city: 'Amman' }),
    /already in use/,
  );
});

test('create: rejects empty required fields', async () => {
  const prisma = buildFakePrisma();
  const service = new OperationalAreasService(prisma as any);
  await assert.rejects(() => service.create({ code: '', name: 'x', type: 'CITY', city: 'x' }), /code is required/);
  await assert.rejects(() => service.create({ code: 'X', name: '', type: 'CITY', city: 'x' }), /name is required/);
  await assert.rejects(() => service.create({ code: 'X', name: 'x', type: 'CITY', city: '' }), /city is required/);
});

test('create: rejects invalid types', async () => {
  const prisma = buildFakePrisma();
  const service = new OperationalAreasService(prisma as any);
  await assert.rejects(
    () => service.create({ code: 'X', name: 'x', type: 'INVALID_TYPE' as any, city: 'x' }),
    /type must be one of/,
  );
});

test('update: applies partial changes', async () => {
  const prisma = buildFakePrisma();
  const service = new OperationalAreasService(prisma as any);
  const created = await service.create({ code: 'AMM', name: 'Amman City', type: 'CITY', city: 'Amman' });
  const updated = await service.update(created.id, { name: 'Renamed' });
  assert.equal(updated.name, 'Renamed');
  assert.equal(updated.code, 'AMM'); // unchanged
});

test('update: rejects duplicate code on another row', async () => {
  const prisma = buildFakePrisma();
  const service = new OperationalAreasService(prisma as any);
  await service.create({ code: 'AMM', name: 'Amman City', type: 'CITY', city: 'Amman' });
  const second = await service.create({ code: 'PET', name: 'Petra', type: 'TOURISM_SITE', city: 'Petra' });
  await assert.rejects(
    () => service.update(second.id, { code: 'AMM' }),
    /already in use/,
  );
});

test('remove: soft-deactivates (preserves operational history)', async () => {
  const prisma = buildFakePrisma();
  const service = new OperationalAreasService(prisma as any);
  const created = await service.create({ code: 'AMM', name: 'Amman City', type: 'CITY', city: 'Amman' });
  await service.remove(created.id);
  const row = (prisma as any).__store[0];
  assert.equal(row.isActive, false);
  // Row stays in the store — Route Standards referencing 'Amman' still
  // resolve via the legacy fromCity/toCity values; only the dropdown
  // listings hide inactive rows by default.
  assert.equal((prisma as any).__store.length, 1);
});

// ---------------------------------------------------------------------------
// findByCity preference order
// ---------------------------------------------------------------------------
test('findByCity: picks CITY when a city has multiple entries (Amman → Amman City, not QAIA)', async () => {
  const prisma = buildFakePrisma([
    { id: 'a-amm', code: 'AMM', name: 'Amman City', type: 'CITY', city: 'Amman', isActive: true },
    { id: 'a-qaia', code: 'QAIA', name: 'Queen Alia', type: 'AIRPORT', city: 'Amman', isActive: true },
  ]);
  const service = new OperationalAreasService(prisma as any);
  const found = await service.findByCity('Amman');
  assert.equal(found?.code, 'AMM');
  assert.equal(found?.type, 'CITY');
});

test('findByCity: preferType lets caller force the AIRPORT variant', async () => {
  const prisma = buildFakePrisma([
    { id: 'a-amm', code: 'AMM', name: 'Amman City', type: 'CITY', city: 'Amman', isActive: true },
    { id: 'a-qaia', code: 'QAIA', name: 'Queen Alia', type: 'AIRPORT', city: 'Amman', isActive: true },
  ]);
  const service = new OperationalAreasService(prisma as any);
  const found = await service.findByCity('Amman', { preferType: 'AIRPORT' });
  assert.equal(found?.code, 'QAIA');
});

test('findByCity: returns null when no area matches the city', async () => {
  const prisma = buildFakePrisma([
    { id: 'a-amm', code: 'AMM', name: 'Amman City', type: 'CITY', city: 'Amman', isActive: true },
  ]);
  const service = new OperationalAreasService(prisma as any);
  const found = await service.findByCity('Atlantis');
  assert.equal(found, null);
});

// ---------------------------------------------------------------------------
// findAll filters
// ---------------------------------------------------------------------------
test('findAll: onlyActive filters out deactivated rows', async () => {
  const prisma = buildFakePrisma([
    { id: 'a1', code: 'AMM', name: 'Amman', type: 'CITY', city: 'Amman', isActive: true },
    { id: 'a2', code: 'OLD', name: 'Retired', type: 'CITY', city: 'Old', isActive: false },
  ]);
  const service = new OperationalAreasService(prisma as any);
  const all = await service.findAll();
  assert.equal(all.length, 2);
  const active = await service.findAll({ onlyActive: true });
  assert.equal(active.length, 1);
  assert.equal((active[0] as any).code, 'AMM');
});

test('findAll: type filter narrows to a single category', async () => {
  const prisma = buildFakePrisma([
    { id: 'a1', code: 'AMM', name: 'Amman', type: 'CITY', city: 'Amman', isActive: true },
    { id: 'a2', code: 'QAIA', name: 'QAIA', type: 'AIRPORT', city: 'Amman', isActive: true },
    { id: 'a3', code: 'PET', name: 'Petra', type: 'TOURISM_SITE', city: 'Petra', isActive: true },
  ]);
  const service = new OperationalAreasService(prisma as any);
  const airports = await service.findAll({ type: 'AIRPORT' });
  assert.equal(airports.length, 1);
  assert.equal((airports[0] as any).code, 'QAIA');
});
