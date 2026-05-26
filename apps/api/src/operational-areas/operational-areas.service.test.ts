import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OperationalAreasService,
  normalizeAreaCode,
  OPERATIONAL_AREA_TYPES,
  compareAreasByPriority,
} from './operational-areas.service';

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

// ---------------------------------------------------------------------------
// Preferred Operational Area Logic (v2C addendum)
// ---------------------------------------------------------------------------
test('compareAreasByPriority: lower priority wins (QAIA=1 beats Marka=2 for AIRPORT)', () => {
  const qaia = { type: 'AIRPORT', name: 'Queen Alia International', priority: 1 };
  const marka = { type: 'AIRPORT', name: 'Marka Airport', priority: 2 };
  const sorted = [marka, qaia].sort(compareAreasByPriority);
  assert.equal(sorted[0].name, 'Queen Alia International');
});

test('compareAreasByPriority: NULL priority loses to any set priority', () => {
  const unrated = { type: 'BORDER', name: 'Aaa Unrated Border', priority: null as number | null };
  const rated = { type: 'BORDER', name: 'Sheikh Hussein', priority: 2 };
  const sorted = [unrated, rated].sort(compareAreasByPriority);
  // Sheikh Hussein wins even though it's later alphabetically — explicit
  // priority always beats NULL.
  assert.equal(sorted[0].name, 'Sheikh Hussein');
});

test('compareAreasByPriority: ALLENBY=1 beats SHB=2 beats WAB=3 for BORDER', () => {
  const allenby = { type: 'BORDER', name: 'King Hussein Bridge (Allenby)', priority: 1 };
  const shb = { type: 'BORDER', name: 'Sheikh Hussein', priority: 2 };
  const wab = { type: 'BORDER', name: 'Wadi Araba', priority: 3 };
  const sorted = [wab, shb, allenby].sort(compareAreasByPriority);
  assert.deepEqual(
    sorted.map((s) => s.priority),
    [1, 2, 3],
  );
});

test('compareAreasByPriority: same priority falls back to PREFERRED_TYPE_ORDER (CITY before AIRPORT)', () => {
  const airport = { type: 'AIRPORT', name: 'Some Airport', priority: 1 };
  const city = { type: 'CITY', name: 'Some City', priority: 1 };
  const sorted = [airport, city].sort(compareAreasByPriority);
  assert.equal(sorted[0].type, 'CITY');
});

test('compareAreasByPriority: same priority + same type falls back to alphabetical name', () => {
  const b = { type: 'CITY', name: 'Bbbb', priority: 1 };
  const a = { type: 'CITY', name: 'Aaaa', priority: 1 };
  const sorted = [b, a].sort(compareAreasByPriority);
  assert.equal(sorted[0].name, 'Aaaa');
});

test('compareAreasByPriority: both NULL falls back to PREFERRED_TYPE_ORDER + alphabetical', () => {
  const c = { type: 'AIRPORT', name: 'Camp Z', priority: null as number | null };
  const a = { type: 'CITY', name: 'Bbb', priority: null as number | null };
  const b = { type: 'CITY', name: 'Aaa', priority: null as number | null };
  const sorted = [c, a, b].sort(compareAreasByPriority);
  // CITY before AIRPORT; within CITY, Aaa before Bbb.
  assert.equal(sorted[0].name, 'Aaa');
  assert.equal(sorted[1].name, 'Bbb');
  assert.equal(sorted[2].name, 'Camp Z');
});

test('findByCity: priority beats type-order — QAIA=1 wins for Amman even though CITY normally wins', async () => {
  const prisma = buildFakePrisma([
    // Operator demoted the CITY row to priority 2; QAIA is priority 1.
    // Priority should beat the default CITY-before-AIRPORT ordering.
    { id: 'a-amm', code: 'AMM', name: 'Amman City', type: 'CITY', city: 'Amman', isActive: true, priority: 2 },
    { id: 'a-qaia', code: 'QAIA', name: 'Queen Alia', type: 'AIRPORT', city: 'Amman', isActive: true, priority: 1 },
  ]);
  const service = new OperationalAreasService(prisma as any);
  const found = await service.findByCity('Amman');
  assert.equal(found?.code, 'QAIA');
});

test('findByCity: preferType + priority — picks QAIA over Marka for AIRPORT/Amman', async () => {
  const prisma = buildFakePrisma([
    { id: 'a-amm', code: 'AMM', name: 'Amman City', type: 'CITY', city: 'Amman', isActive: true, priority: 1 },
    { id: 'a-qaia', code: 'QAIA', name: 'Queen Alia', type: 'AIRPORT', city: 'Amman', isActive: true, priority: 1 },
    { id: 'a-marka', code: 'MARKA', name: 'Marka Airport', type: 'AIRPORT', city: 'Amman', isActive: true, priority: 2 },
  ]);
  const service = new OperationalAreasService(prisma as any);
  const found = await service.findByCity('Amman', { preferType: 'AIRPORT' });
  assert.equal(found?.code, 'QAIA');
});

test('create + update: priority is normalized + persisted', async () => {
  const prisma = buildFakePrisma();
  const service = new OperationalAreasService(prisma as any);
  const created = await service.create({
    code: 'QAIA',
    name: 'Queen Alia International',
    type: 'AIRPORT',
    city: 'Amman',
    priority: 1,
  });
  assert.equal(created.priority, 1);
  const updated = await service.update(created.id, { priority: 2 });
  assert.equal(updated.priority, 2);
  // Setting to null clears the priority.
  const cleared = await service.update(created.id, { priority: null });
  assert.equal(cleared.priority, null);
});

test('create: priority normalization rejects negatives + non-numeric', async () => {
  const prisma = buildFakePrisma();
  const service = new OperationalAreasService(prisma as any);
  const created = await service.create({
    code: 'TEST',
    name: 'Test Area',
    type: 'CITY',
    city: 'Testville',
    priority: -5 as any,
  });
  // Negative becomes NULL (treated as "operator didn't opine").
  assert.equal(created.priority, null);
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
