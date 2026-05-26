import test from 'node:test';
import assert from 'node:assert/strict';

import { RouteStandardsService } from './route-standards.service';
import { pickAreaByCity, OperationalArea } from './operational-areas';

// Operational Areas Catalog v1 — the dictionary now lives in the DB, but
// the tests still need a deterministic in-memory snapshot to feed the
// service. Mirror the migration seed.
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

// Route Standard Edit Page Canonical Builder v1 — tests for:
//   1. findAreaByCity preselection helper (mirrors the client-side helper
//      in CanonicalBuilderSection.tsx — keep in sync if either changes)
//   2. PATCH applies canonicalRouteCode without touching legacy routeCode
//   3. previewRouteCreation does NOT report a duplicate when only the
//      current row owns the suggested code (handled UI-side, but verify
//      the backend exposes enough info to filter)

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
// pickAreaByCity — pure preference-order helper
// -----------------------------------------------------------------------
test('pickAreaByCity: returns the CITY-type area when a city has multiple area entries (Amman → Amman City, not QAIA)', () => {
  const found = pickAreaByCity(JORDAN_AREAS_FIXTURE, 'Amman');
  assert.ok(found);
  assert.equal(found?.code, 'AMM');
  assert.equal(found?.type, 'CITY');
});

test('pickAreaByCity: returns TOURISM_SITE when city has no CITY-type area (Petra → Petra Visitor Center)', () => {
  // 'Petra' anchors only Petra Visitor Center (TOURISM_SITE), not a
  // city entry. Helper falls back through PREFERRED_TYPE_ORDER until
  // it finds a match.
  const found = pickAreaByCity(JORDAN_AREAS_FIXTURE, 'Petra');
  assert.ok(found);
  assert.equal(found?.code, 'PET');
  assert.equal(found?.type, 'TOURISM_SITE');
});

test('pickAreaByCity: case-insensitive', () => {
  assert.equal(pickAreaByCity(JORDAN_AREAS_FIXTURE, 'amman')?.code, 'AMM');
  assert.equal(pickAreaByCity(JORDAN_AREAS_FIXTURE, 'AMMAN')?.code, 'AMM');
  assert.equal(pickAreaByCity(JORDAN_AREAS_FIXTURE, '  Amman  ')?.code, 'AMM');
});

test('pickAreaByCity: null on miss / empty / nullish', () => {
  assert.equal(pickAreaByCity(JORDAN_AREAS_FIXTURE, null), null);
  assert.equal(pickAreaByCity(JORDAN_AREAS_FIXTURE, undefined), null);
  assert.equal(pickAreaByCity(JORDAN_AREAS_FIXTURE, ''), null);
  assert.equal(pickAreaByCity(JORDAN_AREAS_FIXTURE, 'Atlantis'), null);
});

test('pickAreaByCity: preferType lets a caller force the AIRPORT variant when both exist', () => {
  // Amman has Amman City (CITY) + Queen Alia (AIRPORT). Caller can ask
  // for AIRPORT explicitly.
  const found = pickAreaByCity(JORDAN_AREAS_FIXTURE, 'Amman', { preferType: 'AIRPORT' });
  assert.equal(found?.code, 'QAIA');
  assert.equal(found?.type, 'AIRPORT');
});

// -----------------------------------------------------------------------
// PATCH preserves legacy routeCode
// -----------------------------------------------------------------------
test('update: applying canonicalRouteCode via the PATCH endpoint never touches routeCode', async () => {
  // This guards the Canonical Builder's contract: only canonical fields
  // are written, the legacy routeCode column remains intact so old
  // quote items / vouchers / dispatch references still resolve.
  const prisma = buildFakePrisma([
    {
      id: 'row-1',
      routeCode: 'JORDAN_AMMAN_CITY_JORDAN_PETRA_VISITOR_CENTER',
      canonicalRouteCode: null,
      routeName: 'old legacy name',
      fromCity: 'Amman',
      toCity: 'Petra',
      isActive: true,
      reviewStatus: 'AUTO_BOOTSTRAP',
    },
  ]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);

  // Simulate the PATCH body the Canonical Builder sends.
  await service.update('row-1', {
    canonicalRouteCode: 'AMM_PET',
    reviewStatus: 'CANONICALIZED',
    routeName: 'Amman City → Petra Visitor Center',
    fromCity: 'Amman',
    toCity: 'Petra',
  });

  const row = (prisma as any).__store[0];
  // Legacy code preserved
  assert.equal(row.routeCode, 'JORDAN_AMMAN_CITY_JORDAN_PETRA_VISITOR_CENTER');
  // Canonical written
  assert.equal(row.canonicalRouteCode, 'AMM_PET');
  // Review status updated
  assert.equal(row.reviewStatus, 'CANONICALIZED');
  // Cleaner route name written
  assert.equal(row.routeName, 'Amman City → Petra Visitor Center');
});

// -----------------------------------------------------------------------
// previewRouteCreation surfaces enough info for the UI to filter self
// -----------------------------------------------------------------------
test('previewRouteCreation: returns existingMatch.id so the edit page can filter "match against self"', async () => {
  // When the row being edited already has canonicalRouteCode=AMM_PET and
  // the operator picks Amman + Petra in the Canonical Builder, the preview
  // returns existingMatch — but its id IS the current row. The UI uses
  // existingMatch.id !== standardId to suppress the "duplicate" warning.
  const prisma = buildFakePrisma([
    {
      id: 'self-row',
      routeCode: 'AMM_PET',
      canonicalRouteCode: 'AMM_PET',
      routeName: 'Amman → Petra',
      isActive: true,
    },
  ]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  const preview = await service.previewRouteCreation({ fromAreaCode: 'AMM', toAreaCode: 'PET' });
  assert.ok(preview.existingMatch);
  // Critical: id is exposed so the client can compare against standardId.
  assert.equal(preview.existingMatch?.id, 'self-row');
  assert.equal(preview.suggestedCode, 'AMM_PET');
});

test('previewRouteCreation: returns existingMatch.id != currentRowId when a DIFFERENT row owns the canonical code', async () => {
  // Conflict case — another row already owns AMM_PET. The UI must block
  // the Apply button so the operator can't accidentally create two rows
  // competing for the same canonical identifier.
  const prisma = buildFakePrisma([
    {
      id: 'conflicting-row',
      routeCode: 'AMM_PET',
      canonicalRouteCode: 'AMM_PET',
      routeName: 'Amman → Petra (verified)',
      isActive: true,
    },
    {
      id: 'editing-row',
      routeCode: 'JORDAN_AMMAN_CITY_JORDAN_PETRA',
      canonicalRouteCode: null,
      fromCity: 'Amman',
      toCity: 'Petra',
      isActive: true,
    },
  ]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  const preview = await service.previewRouteCreation({ fromAreaCode: 'AMM', toAreaCode: 'PET' });
  // existingMatch is the OTHER row, not the editing-row.
  assert.equal(preview.existingMatch?.id, 'conflicting-row');
  // Client compares against standardId='editing-row' → different →
  // shows blocking warning. UI behaviour is verified by inspection;
  // the backend just needs to surface the id cleanly.
});

// -----------------------------------------------------------------------
// Reverse-route helper (same endpoint, swapped areas)
// -----------------------------------------------------------------------
test('reverse-route helper: editing AMM_PET → previewRouteCreation with swapped areas reports whether PET_AMM exists', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'amm-pet',
      routeCode: 'AMM_PET',
      canonicalRouteCode: 'AMM_PET',
      routeName: 'Amman → Petra',
      isActive: true,
    },
    // PET_AMM is intentionally absent
  ]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  const reverse = await service.previewRouteCreation({ fromAreaCode: 'PET', toAreaCode: 'AMM' });
  assert.equal(reverse.suggestedCode, 'PET_AMM');
  // Reverse doesn't exist → existingMatch is null → UI shows "missing".
  assert.equal(reverse.existingMatch, null);
});

test('reverse-route helper: when PET_AMM also exists, the helper reports it as present', async () => {
  const prisma = buildFakePrisma([
    { id: 'amm-pet', routeCode: 'AMM_PET', canonicalRouteCode: 'AMM_PET', routeName: 'Amman → Petra', isActive: true },
    { id: 'pet-amm', routeCode: 'PET_AMM', canonicalRouteCode: 'PET_AMM', routeName: 'Petra → Amman', isActive: true },
  ]);
  const service = new RouteStandardsService(prisma as any, fakeAreasService);
  const reverse = await service.previewRouteCreation({ fromAreaCode: 'PET', toAreaCode: 'AMM' });
  assert.ok(reverse.existingMatch);
  assert.equal(reverse.existingMatch?.id, 'pet-amm');
});
