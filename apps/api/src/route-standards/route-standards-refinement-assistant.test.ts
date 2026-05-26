import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RouteStandardsService,
  suggestCanonicalFromLegacyCode,
  findReverseStandard,
} from './route-standards.service';

// Refinement Assistant v1 — tests for legacy-code parsing, reverse-route
// inheritance, and the safety guards on apply (no overwriting VERIFIED /
// MANUAL rows, never modifies routeCode, recomputes suspicious flag).

// -----------------------------------------------------------------------
// In-memory prisma shim covering the assistant's reads + writes.
// -----------------------------------------------------------------------
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
      findUnique: async ({ where }: any) => store.find((r) => r.id === where.id) || null,
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
// suggestCanonicalFromLegacyCode
// -----------------------------------------------------------------------
test('suggestCanonicalFromLegacyCode: spec examples — JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT → AMM_QAIA', () => {
  assert.equal(suggestCanonicalFromLegacyCode('JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT'), 'AMM_QAIA');
});

test('suggestCanonicalFromLegacyCode: spec examples — DEAD_SEA_RESORT_AREA_PETRA_VISITOR_CENTER → DS_PET', () => {
  assert.equal(suggestCanonicalFromLegacyCode('DEAD_SEA_RESORT_AREA_PETRA_VISITOR_CENTER'), 'DS_PET');
});

test('suggestCanonicalFromLegacyCode: recovers the real bootstrap garbage codes', () => {
  // The actual messy codes we've seen on the live dashboard. Each should
  // resolve to a clean FROM_TO via greedy alias matching.
  assert.equal(
    suggestCanonicalFromLegacyCode('AMMAN_CITY_CENTER_KING_HUSSEIN_BRIDGE'),
    'AMM_ALLENBY',
  );
  assert.equal(
    suggestCanonicalFromLegacyCode('AMMAN_CITY_CENTER_AQABA_CITY_CENTER'),
    'AMM_AQJ',
  );
  assert.equal(
    suggestCanonicalFromLegacyCode('QUEEN_ALIA_INTERNATIONAL_AIRPORT_PETRA_VISITOR_CENTER'),
    'QAIA_PET',
  );
  assert.equal(
    suggestCanonicalFromLegacyCode('AMMAN_CITY_CENTER_WADI_RUM_CAMP_AREA'),
    'AMM_WR',
  );
  assert.equal(
    suggestCanonicalFromLegacyCode('JERASH_ARCHAEOLOGICAL_SITE_AMMAN_CITY_CENTER'),
    'JER_AMM',
  );
});

test('suggestCanonicalFromLegacyCode: COPY_OF_ prefix strips and resolves', () => {
  assert.equal(
    suggestCanonicalFromLegacyCode('COPY_OF_JOR_TR_SOUTH_KERAK_PETRA_ON_2'),
    'KRK_PET',
  );
});

test('suggestCanonicalFromLegacyCode: returns null when fewer than 2 distinct aliases are found', () => {
  assert.equal(suggestCanonicalFromLegacyCode('UNKNOWN_PLACE_GIBBERISH'), null);
  assert.equal(suggestCanonicalFromLegacyCode(''), null);
  assert.equal(suggestCanonicalFromLegacyCode(null), null);
  // Same alias on both halves shouldn't produce AMM_AMM:
  assert.equal(suggestCanonicalFromLegacyCode('AMMAN_CITY_AMMAN'), null);
});

// -----------------------------------------------------------------------
// findReverseStandard
// -----------------------------------------------------------------------
test('findReverseStandard: matches via canonicalRouteCode swap (AMM_PET ↔ PET_AMM)', () => {
  const standards = [
    { id: 'id-1', canonicalRouteCode: 'AMM_PET', fromCity: 'Amman', toCity: 'Petra' },
    { id: 'id-2', canonicalRouteCode: 'PET_AMM', fromCity: 'Petra', toCity: 'Amman' },
  ];
  const reverse = findReverseStandard(standards[0] as any, standards as any);
  assert.equal(reverse?.id, 'id-2');
});

test('findReverseStandard: falls back to fromCity/toCity swap when canonical missing', () => {
  const standards = [
    { id: 'id-1', canonicalRouteCode: null, fromCity: 'Amman', toCity: 'Petra' },
    { id: 'id-2', canonicalRouteCode: null, fromCity: 'Petra', toCity: 'Amman' },
  ];
  const reverse = findReverseStandard(standards[0] as any, standards as any);
  assert.equal(reverse?.id, 'id-2');
});

test('findReverseStandard: returns null when no reverse exists', () => {
  const standards = [
    { id: 'id-1', canonicalRouteCode: 'AMM_PET', fromCity: 'Amman', toCity: 'Petra' },
  ];
  const reverse = findReverseStandard(standards[0] as any, standards as any);
  assert.equal(reverse, null);
});

// -----------------------------------------------------------------------
// buildRefinementQueue
// -----------------------------------------------------------------------
test('buildRefinementQueue: suggests duration inheritance from reverse route', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'id-1',
      routeCode: 'AMM_PET',
      routeName: 'Amman to Petra',
      canonicalRouteCode: 'AMM_PET',
      fromCity: 'Amman',
      toCity: 'Petra',
      standardDurationHours: 3.5,
      standardDistanceKm: 235,
      isActive: true,
      reviewStatus: 'CANONICALIZED',
    },
    {
      id: 'id-2',
      routeCode: 'PET_AMM',
      routeName: 'Petra to Amman',
      canonicalRouteCode: 'PET_AMM',
      fromCity: 'Petra',
      toCity: 'Amman',
      standardDurationHours: null, // missing
      standardDistanceKm: null, // missing
      isActive: true,
      reviewStatus: 'CANONICALIZED',
    },
  ]);
  const service = new RouteStandardsService(prisma as any);
  const queue = await service.buildRefinementQueue();
  // Two suggestions: duration + distance, both inherited from reverse
  const durationTask = queue.tasks.find((t) => t.rowId === 'id-2' && t.field === 'standardDurationHours');
  const distanceTask = queue.tasks.find((t) => t.rowId === 'id-2' && t.field === 'standardDistanceKm');
  assert.ok(durationTask, 'duration suggestion exists');
  assert.equal(durationTask?.suggestedValue, 3.5);
  assert.equal(durationTask?.suggestionSource, 'reverse_route');
  assert.equal(durationTask?.reviewBucket, 'MISSING_DURATION');
  assert.ok(distanceTask);
  assert.equal(distanceTask?.suggestedValue, 235);
  assert.equal(distanceTask?.suggestionSource, 'reverse_route');
});

test('buildRefinementQueue: suggests canonical code from legacy parse when city fields missing', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'id-1',
      routeCode: 'JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT',
      routeName: 'Amman to QAIA',
      canonicalRouteCode: null, // not canonicalized yet
      fromCity: null, // missing — city-fields deriver returns null
      toCity: null,
      isActive: true,
      reviewStatus: null,
    },
  ]);
  const service = new RouteStandardsService(prisma as any);
  const queue = await service.buildRefinementQueue();
  const canonicalTask = queue.tasks.find((t) => t.field === 'canonicalRouteCode');
  assert.ok(canonicalTask);
  assert.equal(canonicalTask?.suggestedValue, 'AMM_QAIA');
  assert.equal(canonicalTask?.suggestionSource, 'legacy_code_parse');
  // Airport routes get top priority.
  assert.equal(canonicalTask?.category, 'AIRPORT');
});

test('buildRefinementQueue: marks VERIFIED rows as protected (but still surfaces them for transparency)', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'id-1',
      routeCode: 'AMM_PET_OLD',
      routeName: 'Amman to Petra',
      canonicalRouteCode: null,
      fromCity: 'Amman',
      toCity: 'Petra',
      isActive: true,
      reviewStatus: 'VERIFIED',
    },
  ]);
  const service = new RouteStandardsService(prisma as any);
  const queue = await service.buildRefinementQueue();
  const task = queue.tasks.find((t) => t.field === 'canonicalRouteCode');
  // The task is still surfaced so the operator sees the suggestion, but
  // the apply endpoint will refuse it (tested below) and the UI shows
  // a "Protected" chip with apply disabled.
  assert.ok(task);
  assert.equal(task?.isProtected, true);
});

test('buildRefinementQueue: airport routes sort before tourism hubs sort before borders', async () => {
  const prisma = buildFakePrisma([
    { id: 'id-border', routeCode: 'AMM_ALLENBY', routeName: 'Amman to Allenby', canonicalRouteCode: null, fromCity: 'Amman', toCity: 'Allenby', isActive: true, borderCrossingFlag: true },
    { id: 'id-petra', routeCode: 'AMM_PET_LEGACY', routeName: 'Amman to Petra', canonicalRouteCode: null, fromCity: 'Amman', toCity: 'Petra', isActive: true },
    { id: 'id-airport', routeCode: 'AMM_QAIA_LEGACY', routeName: 'Amman to QAIA', canonicalRouteCode: null, fromCity: 'Amman', toCity: 'QAIA', isActive: true, airportRouteFlag: true },
  ]);
  const service = new RouteStandardsService(prisma as any);
  const queue = await service.buildRefinementQueue();
  const ids = queue.tasks.map((t) => t.rowId);
  assert.equal(ids[0], 'id-airport');
  // Petra (priority 1) before Border (priority 5)
  assert.ok(ids.indexOf('id-petra') < ids.indexOf('id-border'));
});

// -----------------------------------------------------------------------
// applyRefinementSuggestion safety
// -----------------------------------------------------------------------
test('applyRefinementSuggestion: writes canonicalRouteCode without touching legacy routeCode', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'id-1',
      routeCode: 'JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT',
      routeName: 'Amman to QAIA',
      canonicalRouteCode: null,
      fromCity: 'Amman',
      toCity: 'QAIA',
      isActive: true,
      reviewStatus: 'AUTO_BOOTSTRAP',
    },
  ]);
  const service = new RouteStandardsService(prisma as any);
  await service.applyRefinementSuggestion({
    rowId: 'id-1',
    field: 'canonicalRouteCode',
    value: 'AMM_QAIA',
  });
  // Legacy routeCode preserved — critical for booking / voucher lookup
  // compatibility.
  const row = (prisma as any).__store[0];
  assert.equal(row.routeCode, 'JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT');
  assert.equal(row.canonicalRouteCode, 'AMM_QAIA');
});

test('applyRefinementSuggestion: refuses to apply to VERIFIED rows', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'id-1',
      routeCode: 'AMM_PET',
      routeName: 'Amman to Petra',
      canonicalRouteCode: 'AMM_PET',
      fromCity: 'Amman',
      toCity: 'Petra',
      isActive: true,
      reviewStatus: 'VERIFIED',
    },
  ]);
  const service = new RouteStandardsService(prisma as any);
  await assert.rejects(
    () =>
      service.applyRefinementSuggestion({
        rowId: 'id-1',
        field: 'standardDurationHours',
        value: 4.0,
      }),
    /VERIFIED/,
  );
});

test('applyRefinementSuggestion: refuses to apply to source=MANUAL rows', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'id-1',
      routeCode: 'AMM_PET',
      routeName: 'Amman to Petra',
      canonicalRouteCode: null,
      fromCity: 'Amman',
      toCity: 'Petra',
      isActive: true,
      source: 'MANUAL',
    },
  ]);
  const service = new RouteStandardsService(prisma as any);
  await assert.rejects(
    () =>
      service.applyRefinementSuggestion({
        rowId: 'id-1',
        field: 'canonicalRouteCode',
        value: 'AMM_PET',
      }),
    /MANUAL/,
  );
});

test('applyRefinementSuggestion: recomputes suspiciousDurationFlag honestly on duration write', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'id-1',
      routeCode: 'AMM_DS_REVERSED_FROM_DS_PET',
      routeName: 'Amman to Dead Sea',
      canonicalRouteCode: 'AMM_DS',
      fromCity: 'Amman',
      toCity: 'Dead Sea',
      standardDurationHours: null,
      isActive: true,
      reviewStatus: 'CANONICALIZED',
      suspiciousDurationFlag: false,
    },
  ]);
  const service = new RouteStandardsService(prisma as any);
  // Apply a reverse-route value that happens to be excursion-day length
  // (8 h). The flag must flip to true so the dashboard still flags it
  // for review — assistant can suggest, but sanity validator is honest.
  await service.applyRefinementSuggestion({
    rowId: 'id-1',
    field: 'standardDurationHours',
    value: 8,
  });
  const row = (prisma as any).__store[0];
  assert.equal(row.standardDurationHours, 8);
  assert.equal(row.suspiciousDurationFlag, true);
});

// -----------------------------------------------------------------------
// applyBulkRefinementSuggestions
// -----------------------------------------------------------------------
test('applyBulkRefinementSuggestions: per-item results — VERIFIED rows fail individually, others succeed', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'id-good',
      routeCode: 'AMM_PET_LEGACY',
      routeName: 'Amman to Petra',
      canonicalRouteCode: null,
      fromCity: 'Amman',
      toCity: 'Petra',
      isActive: true,
      reviewStatus: 'AUTO_BOOTSTRAP',
    },
    {
      id: 'id-verified',
      routeCode: 'PET_WR',
      routeName: 'Petra to Wadi Rum',
      canonicalRouteCode: 'PET_WR',
      fromCity: 'Petra',
      toCity: 'Wadi Rum',
      isActive: true,
      reviewStatus: 'VERIFIED',
    },
  ]);
  const service = new RouteStandardsService(prisma as any);
  const result = await service.applyBulkRefinementSuggestions([
    { rowId: 'id-good', field: 'canonicalRouteCode', value: 'AMM_PET' },
    { rowId: 'id-verified', field: 'canonicalRouteCode', value: 'PET_WR_RENAMED' },
  ]);
  assert.equal(result.appliedCount, 1);
  assert.equal(result.skippedCount, 1);
  const good = result.results.find((r) => r.rowId === 'id-good');
  const verified = result.results.find((r) => r.rowId === 'id-verified');
  assert.equal(good?.ok, true);
  assert.equal(verified?.ok, false);
  assert.match(verified?.error || '', /VERIFIED/);
  // Side-effect check: only the unprotected row was modified.
  const goodRow = (prisma as any).__store.find((r: any) => r.id === 'id-good');
  const verifiedRow = (prisma as any).__store.find((r: any) => r.id === 'id-verified');
  assert.equal(goodRow.canonicalRouteCode, 'AMM_PET');
  assert.equal(verifiedRow.canonicalRouteCode, 'PET_WR'); // untouched
});
