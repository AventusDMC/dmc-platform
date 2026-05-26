import test from 'node:test';
import assert from 'node:assert/strict';

import { RouteStandardsService } from './route-standards.service';
import { pickAreaByCode, pickAreaById, mergeDefaultFlagsFor, OperationalArea } from './operational-areas';

// Operational Areas Catalog v1 — the dictionary now lives in the DB,
// but tests need a deterministic in-memory fixture. Mirror the migration
// seed.
const JORDAN_AREAS_FIXTURE: OperationalArea[] = [
  { id: 'a-amm', code: 'AMM', name: 'Amman City', type: 'CITY', city: 'Amman' },
  { id: 'a-qaia', code: 'QAIA', name: 'Queen Alia International Airport', type: 'AIRPORT', city: 'Amman', airportRouteFlagDefault: true },
  { id: 'a-pet', code: 'PET', name: 'Petra Visitor Center', type: 'TOURISM_SITE', city: 'Petra' },
  { id: 'a-wr', code: 'WR', name: 'Wadi Rum Camp Area', type: 'CAMP_AREA', city: 'Wadi Rum' },
  { id: 'a-aqj', code: 'AQJ', name: 'Aqaba City', type: 'CITY', city: 'Aqaba' },
  { id: 'a-ds', code: 'DS', name: 'Dead Sea Resort Area', type: 'RESORT_AREA', city: 'Dead Sea' },
  { id: 'a-jer', code: 'JER', name: 'Jerash Archaeological Site', type: 'TOURISM_SITE', city: 'Jerash' },
  { id: 'a-mad', code: 'MAD', name: 'Madaba', type: 'CITY', city: 'Madaba' },
  { id: 'a-neb', code: 'NEB', name: 'Mount Nebo', type: 'TOURISM_SITE', city: 'Madaba' },
  { id: 'a-irb', code: 'IRB', name: 'Irbid', type: 'CITY', city: 'Irbid' },
  { id: 'a-allenby', code: 'ALLENBY', name: 'Allenby / King Hussein Bridge', type: 'BORDER', city: 'Dead Sea', borderCrossingFlagDefault: true },
  { id: 'a-shb', code: 'SHB', name: 'Sheikh Hussein Border', type: 'BORDER', city: 'Irbid', borderCrossingFlagDefault: true },
];

const fakeAreasService = {
  findAll: async (_filters?: any) => JORDAN_AREAS_FIXTURE,
} as any;

// Route Code Generator + Duplicate Protection v1 — tests for the
// Route Builder backend: operational area dictionary lookups,
// preview-creation duplicate detection, single + round-trip + multi-
// stop create flows, and Excel bulkUpsert canonical-code dedup.

function buildFakePrisma(initial: Array<any> = []) {
  const store = [...initial];
  return {
    routeStandard: {
      findMany: async (args?: any) => {
        const where = args?.where || {};
        let rows = [...store];
        if (where.isActive !== undefined) {
          rows = rows.filter((r) => Boolean(r.isActive) === Boolean(where.isActive));
        }
        return rows;
      },
      findFirst: async ({ where }: any) => {
        if (!where) return null;
        if (where.canonicalRouteCode) {
          return store.find((r) => r.canonicalRouteCode === where.canonicalRouteCode) || null;
        }
        if (where.routeCode) {
          return store.find((r) => r.routeCode === where.routeCode) || null;
        }
        if (where.fromCity && where.toCity) {
          return (
            store.find(
              (r) =>
                r.fromCity === where.fromCity &&
                r.toCity === where.toCity &&
                (where.isActive === undefined || r.isActive === where.isActive),
            ) || null
          );
        }
        if (where.OR) {
          for (const clause of where.OR) {
            const found = store.find((r) =>
              Object.keys(clause).every((key) => r[key] === clause[key]),
            );
            if (found) return found;
          }
        }
        return null;
      },
      findUnique: async ({ where }: any) =>
        store.find((r) => (where.id ? r.id === where.id : r.routeCode === where.routeCode)) || null,
      create: async ({ data }: any) => {
        const created = { id: `id-${store.length + 1}`, isActive: true, ...data };
        store.push(created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const idx = store.findIndex((r) => r.id === where.id);
        if (idx < 0) throw new Error('not found');
        store[idx] = { ...store[idx], ...data };
        return store[idx];
      },
    },
    __store: store,
  };
}

// -----------------------------------------------------------------------
// Operational area dictionary (Jordan seed fixture mirrors migration seed)
// -----------------------------------------------------------------------
test('JORDAN_AREAS_FIXTURE includes every code called out in the spec', () => {
  const codes = JORDAN_AREAS_FIXTURE.map((a) => a.code);
  // From the spec:
  assert.ok(codes.includes('AMM'), 'Amman City');
  assert.ok(codes.includes('QAIA'), 'Queen Alia Airport');
  assert.ok(codes.includes('PET'), 'Petra Visitor Center');
  assert.ok(codes.includes('WR'), 'Wadi Rum Camp Area');
  assert.ok(codes.includes('AQJ'), 'Aqaba');
  assert.ok(codes.includes('DS'), 'Dead Sea');
  assert.ok(codes.includes('JER'), 'Jerash');
  assert.ok(codes.includes('MAD'), 'Madaba');
  assert.ok(codes.includes('NEB'), 'Mount Nebo');
  assert.ok(codes.includes('ALLENBY'), 'Allenby border');
  assert.ok(codes.includes('SHB'), 'Sheikh Hussein border');
});

test('pickAreaByCode + pickAreaById resolve consistently against the loaded list', () => {
  const amm = pickAreaByCode(JORDAN_AREAS_FIXTURE, 'AMM');
  assert.equal(amm?.code, 'AMM');
  assert.equal(amm?.city, 'Amman');
  assert.equal(pickAreaById(JORDAN_AREAS_FIXTURE, amm!.id)?.code, 'AMM');
  assert.equal(pickAreaByCode(JORDAN_AREAS_FIXTURE, 'unknown-code'), null);
  assert.equal(pickAreaById(JORDAN_AREAS_FIXTURE, 'unknown-id'), null);
});

test('mergeDefaultFlagsFor ORs flags from both endpoints', () => {
  const amm = pickAreaByCode(JORDAN_AREAS_FIXTURE, 'AMM')!;
  const qaia = pickAreaByCode(JORDAN_AREAS_FIXTURE, 'QAIA')!;
  const allenby = pickAreaByCode(JORDAN_AREAS_FIXTURE, 'ALLENBY')!;
  const merged = mergeDefaultFlagsFor(amm, qaia);
  assert.equal(merged.airportRouteFlag, true);
  assert.equal(merged.borderCrossingFlag, false);
  const merged2 = mergeDefaultFlagsFor(qaia, allenby);
  assert.equal(merged2.airportRouteFlag, true);
  assert.equal(merged2.borderCrossingFlag, true);
});

// -----------------------------------------------------------------------
// previewRouteCreation
// -----------------------------------------------------------------------
test('previewRouteCreation: suggests AMM_PET when From=Amman City, To=Petra Visitor Center', async () => {
  const prisma = buildFakePrisma([]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  const preview = await service.previewRouteCreation({ fromAreaCode: 'AMM', toAreaCode: 'PET' });
  assert.equal(preview.suggestedCode, 'AMM_PET');
  assert.equal(preview.suggestedRouteName, 'Amman City → Petra Visitor Center');
  assert.equal(preview.existingMatch, null);
  assert.equal(preview.action, 'create');
});

test('previewRouteCreation: detects duplicate by canonicalRouteCode', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'existing-1',
      routeCode: 'OLD_AMM_PET_LEGACY',
      canonicalRouteCode: 'AMM_PET',
      routeName: 'Amman to Petra (existing)',
      isActive: true,
      standardDurationHours: 3.5,
      standardDistanceKm: 235,
    },
  ]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  const preview = await service.previewRouteCreation({ fromAreaCode: 'AMM', toAreaCode: 'PET' });
  assert.ok(preview.existingMatch);
  assert.equal(preview.existingMatch?.matchReason, 'canonical_code');
  assert.equal(preview.action, 'use-existing');
});

test('previewRouteCreation: detects duplicate by legacy routeCode when canonical missing', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'existing-1',
      routeCode: 'AMM_PET',
      canonicalRouteCode: null,
      routeName: 'Amman to Petra',
      isActive: true,
    },
  ]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  const preview = await service.previewRouteCreation({ fromAreaCode: 'AMM', toAreaCode: 'PET' });
  assert.ok(preview.existingMatch);
  assert.equal(preview.existingMatch?.matchReason, 'legacy_code');
});

test('previewRouteCreation: detects duplicate by city pair when codes do not match', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'existing-1',
      routeCode: 'TOTALLY_DIFFERENT_CODE',
      canonicalRouteCode: null,
      fromCity: 'Amman',
      toCity: 'Petra',
      routeName: 'Old amman-petra row',
      isActive: true,
    },
  ]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  const preview = await service.previewRouteCreation({ fromAreaCode: 'AMM', toAreaCode: 'PET' });
  assert.ok(preview.existingMatch);
  assert.equal(preview.existingMatch?.matchReason, 'city_pair');
});

test('previewRouteCreation: refuses same-area routes', async () => {
  const prisma = buildFakePrisma([]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  await assert.rejects(
    () => service.previewRouteCreation({ fromAreaCode: 'AMM', toAreaCode: 'AMM' }),
    /From and To areas cannot be the same/,
  );
});

// -----------------------------------------------------------------------
// createWithGeneration
// -----------------------------------------------------------------------
test('createWithGeneration: creates new route with generated canonical code', async () => {
  const prisma = buildFakePrisma([]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  const result = await service.createWithGeneration({
    fromAreaCode: 'AMM',
    toAreaCode: 'PET',
    standardDistanceKm: 235,
    standardDurationHours: 3.5,
    operationalBufferMinutes: 30,
  });
  assert.equal(result.action, 'created');
  const row = (prisma as any).__store[0];
  assert.equal(row.routeCode, 'AMM_PET');
  assert.equal(row.canonicalRouteCode, 'AMM_PET');
  assert.equal(row.reviewStatus, 'CANONICALIZED');
  assert.equal(row.source, 'MANUAL'); // operator-created → MANUAL
  assert.equal(row.standardDurationHours, 3.5);
  assert.equal(row.standardDistanceKm, 235);
});

test('createWithGeneration: refuses to create when duplicate exists (without forceCreate)', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'existing-1',
      routeCode: 'OLD_AMM_PET',
      canonicalRouteCode: 'AMM_PET',
      routeName: 'Existing',
      isActive: true,
    },
  ]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  const result = await service.createWithGeneration({ fromAreaCode: 'AMM', toAreaCode: 'PET' });
  assert.equal(result.action, 'use-existing');
  assert.equal((prisma as any).__store.length, 1); // no new row created
});

test('createWithGeneration: alsoCreateReverse creates both legs (AMM_PET + PET_AMM)', async () => {
  const prisma = buildFakePrisma([]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  const result = await service.createWithGeneration(
    {
      fromAreaCode: 'AMM',
      toAreaCode: 'PET',
      standardDistanceKm: 235,
      standardDurationHours: 3.5,
    },
    { alsoCreateReverse: true },
  );
  assert.equal(result.action, 'created');
  assert.ok(result.reverse);
  assert.equal((prisma as any).__store.length, 2);
  const codes = (prisma as any).__store.map((r: any) => r.canonicalRouteCode).sort();
  assert.deepEqual(codes, ['AMM_PET', 'PET_AMM']);
});

test('createWithGeneration: alsoCreateReverse skips reverse leg when it already exists', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'reverse-existing',
      routeCode: 'PET_AMM',
      canonicalRouteCode: 'PET_AMM',
      routeName: 'Petra → Amman',
      isActive: true,
    },
  ]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  const result = await service.createWithGeneration(
    { fromAreaCode: 'AMM', toAreaCode: 'PET' },
    { alsoCreateReverse: true },
  );
  assert.equal(result.action, 'created');
  assert.equal((result.reverse as any).skipped, true);
});

// -----------------------------------------------------------------------
// createMultiStopRoute
// -----------------------------------------------------------------------
test('createMultiStopRoute: builds N-1 legs from an ordered stop list (AMM → MAD → NEB → PET)', async () => {
  const prisma = buildFakePrisma([]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  const result = await service.createMultiStopRoute({
    stops: [{ areaCode: 'AMM' }, { areaCode: 'MAD' }, { areaCode: 'NEB' }, { areaCode: 'PET' }],
  });
  assert.equal(result.stopCount, 4);
  assert.equal(result.legCount, 3);
  assert.equal(result.createdCount, 3);
  assert.equal(result.reusedCount, 0);
  const codes = result.legs.map((l) => l.suggestedCode);
  assert.deepEqual(codes, ['AMM_MAD', 'MAD_NEB', 'NEB_PET']);
  assert.match(result.message, /Touring Route made from multiple legs/);
});

test('createMultiStopRoute: reuses existing legs and only creates the missing ones', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'leg-mad-neb',
      routeCode: 'MAD_NEB',
      canonicalRouteCode: 'MAD_NEB',
      routeName: 'Madaba → Mount Nebo (existing)',
      isActive: true,
    },
  ]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  const result = await service.createMultiStopRoute({
    stops: [{ areaCode: 'AMM' }, { areaCode: 'MAD' }, { areaCode: 'NEB' }, { areaCode: 'PET' }],
  });
  assert.equal(result.createdCount, 2); // AMM_MAD + NEB_PET
  assert.equal(result.reusedCount, 1); // MAD_NEB
  const reusedLeg = result.legs.find((l) => l.suggestedCode === 'MAD_NEB');
  assert.equal(reusedLeg?.action, 'reused');
  assert.equal(reusedLeg?.rowId, 'leg-mad-neb');
});

test('createMultiStopRoute: refuses fewer than 3 stops (use single-leg builder instead)', async () => {
  const prisma = buildFakePrisma([]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  await assert.rejects(
    () => service.createMultiStopRoute({ stops: [{ areaCode: 'AMM' }, { areaCode: 'PET' }] }),
    /at least 3 stops/,
  );
});

// -----------------------------------------------------------------------
// bulkUpsert canonical-code dedup
// -----------------------------------------------------------------------
test('bulkUpsert: re-importing a workbook with the canonical short code updates the existing legacy-coded row', async () => {
  // Existing row has the long legacy code, canonicalized to AMM_PET.
  const prisma = buildFakePrisma([
    {
      id: 'existing-1',
      routeCode: 'JORDAN_AMMAN_CITY_JORDAN_PETRA_VISITOR_CENTER',
      canonicalRouteCode: 'AMM_PET',
      routeName: 'Amman → Petra (existing)',
      isActive: true,
      standardDistanceKm: 230,
      standardDurationHours: 3.5,
    },
  ]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  // Workbook contains the canonical short form with updated numbers.
  const result = await service.bulkUpsert([
    {
      routeCode: 'AMM_PET',
      routeName: 'Amman → Petra',
      fromCity: 'Amman',
      toCity: 'Petra',
      standardDistanceKm: 235,
      standardDurationHours: 3.5,
    },
  ]);
  // Should update the existing row, not create a new one.
  assert.equal(result.created, 0);
  assert.equal(result.updated, 1);
  assert.equal((prisma as any).__store.length, 1);
  const row = (prisma as any).__store[0];
  assert.equal(row.standardDistanceKm, 235); // updated from 230
});

test('bulkUpsert: still creates fresh rows when no dedup target exists', async () => {
  const prisma = buildFakePrisma([]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  const result = await service.bulkUpsert([
    { routeCode: 'AMM_PET', routeName: 'Amman → Petra' },
    { routeCode: 'PET_WR', routeName: 'Petra → Wadi Rum' },
  ]);
  assert.equal(result.created, 2);
  assert.equal(result.updated, 0);
  assert.equal((prisma as any).__store.length, 2);
});

// -----------------------------------------------------------------------
// Preserve existing data
// -----------------------------------------------------------------------
test('createWithGeneration: never touches existing routeCode of any other row', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'unrelated-1',
      routeCode: 'PET_WR',
      canonicalRouteCode: 'PET_WR',
      routeName: 'Petra → Wadi Rum',
      isActive: true,
    },
  ]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  await service.createWithGeneration({ fromAreaCode: 'AMM', toAreaCode: 'PET' });
  // PET_WR is untouched.
  const pwr = (prisma as any).__store.find((r: any) => r.id === 'unrelated-1');
  assert.equal(pwr.routeCode, 'PET_WR');
  assert.equal(pwr.canonicalRouteCode, 'PET_WR');
});
