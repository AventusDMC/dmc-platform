import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RouteStandardsService,
  deriveCanonicalRouteCode,
  detectSuspiciousDuration,
} from './route-standards.service';
import { loadRouteStandardsForBookingServices } from './route-standard-lookup';

// Cleanup Phase v1 — tests for canonical FROM_TO code derivation, suspicious-
// duration detection, merge-duplicates safety, and legacy lookup resolution
// after canonicalization. These guard the operational truth layer against
// regressions when other engines start trusting canonicalRouteCode.

// -----------------------------------------------------------------------
// In-memory prisma shim covering the bits cleanup operations touch.
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
        if (where.OR) {
          // Cleanup-aware lookup: OR over routeCode + canonicalRouteCode
          const codes = new Set<string>();
          for (const clause of where.OR) {
            for (const c of clause?.routeCode?.in || []) codes.add(c);
            for (const c of clause?.canonicalRouteCode?.in || []) codes.add(c);
          }
          rows = rows.filter(
            (r) => codes.has(r.routeCode) || (r.canonicalRouteCode && codes.has(r.canonicalRouteCode)),
          );
        }
        if (where.id?.in) {
          rows = rows.filter((r) => where.id.in.includes(r.id));
        }
        if (args?.select?.routeCode) {
          return rows.map((r) => ({ routeCode: r.routeCode }));
        }
        return rows;
      },
      findUnique: async ({ where }: any) =>
        store.find((r) => (where.id ? r.id === where.id : r.routeCode === where.routeCode)) || null,
      create: async ({ data }: any) => {
        const created = {
          id: `id-${store.length + 1}`,
          isActive: true,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.push(created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const idx = store.findIndex((r) => r.id === where.id);
        if (idx < 0) throw new Error('not found');
        store[idx] = { ...store[idx], ...data, updatedAt: new Date() };
        return store[idx];
      },
    },
    touringRoute: { findMany: async () => [] },
    route: { findMany: async () => [] },
    quoteItem: { findMany: async () => [] },
    __store: store, // expose for assertions
  };
}

// -----------------------------------------------------------------------
// deriveCanonicalRouteCode
// -----------------------------------------------------------------------
test('deriveCanonicalRouteCode: maps Jordan city pairs to FROM_TO short form', () => {
  assert.equal(deriveCanonicalRouteCode('Amman', 'Petra'), 'AMM_PET');
  assert.equal(deriveCanonicalRouteCode('Petra', 'Wadi Rum'), 'PET_WR');
  assert.equal(deriveCanonicalRouteCode('Wadi Rum', 'Aqaba'), 'WR_AQJ');
  assert.equal(deriveCanonicalRouteCode('Dead Sea', 'Amman'), 'DS_AMM');
  assert.equal(deriveCanonicalRouteCode('Amman', 'Jerash'), 'AMM_JER');
  assert.equal(deriveCanonicalRouteCode('King Hussein Bridge', 'Amman'), 'ALLENBY_AMM');
  assert.equal(deriveCanonicalRouteCode('Amman City', 'QAIA'), 'AMM_QAIA');
});

test('deriveCanonicalRouteCode: handles messy bootstrap city tokens via alias map', () => {
  // The messy-code examples from the spec — derivation should still
  // produce clean FROM_TO codes when fromCity/toCity have the verbose
  // forms the bootstrap captured.
  assert.equal(deriveCanonicalRouteCode('Jordan Amman City', 'Jordan QAIA Airport'), 'AMM_QAIA');
  assert.equal(deriveCanonicalRouteCode('Jerash Archaeological Site', 'Amman City Center'), 'JER_AMM');
  assert.equal(deriveCanonicalRouteCode('Jordan Allenby Sheikh Hussein Border', 'Jordan Amman City'), 'ALLENBY_AMM');
});

test('deriveCanonicalRouteCode: returns null when either side is missing or identical', () => {
  assert.equal(deriveCanonicalRouteCode('Amman', null), null);
  assert.equal(deriveCanonicalRouteCode(null, 'Petra'), null);
  assert.equal(deriveCanonicalRouteCode('', ''), null);
  // Same city — no FROM_TO; this is a same-city transfer that the
  // catalog shouldn't model as a route.
  assert.equal(deriveCanonicalRouteCode('Amman', 'Amman'), null);
});

// -----------------------------------------------------------------------
// detectSuspiciousDuration
// -----------------------------------------------------------------------
test('detectSuspiciousDuration: flags the bootstrap-blown durations from the spec', () => {
  // The three concrete examples called out in the spec.
  assert.equal(detectSuspiciousDuration('Dead Sea', 'Petra', 11).suspicious, true);
  assert.equal(detectSuspiciousDuration('Dead Sea', 'Wadi Rum', 13).suspicious, true);
  assert.equal(detectSuspiciousDuration('Irbid', 'Jerash', 6).suspicious, true);
});

test('detectSuspiciousDuration: accepts realistic transfer timings', () => {
  assert.equal(detectSuspiciousDuration('Amman', 'Petra', 3.5).suspicious, false);
  assert.equal(detectSuspiciousDuration('Petra', 'Wadi Rum', 1.75).suspicious, false);
  assert.equal(detectSuspiciousDuration('Amman', 'Dead Sea', 1.0).suspicious, false);
  assert.equal(detectSuspiciousDuration('Amman', 'Jerash', 1.0).suspicious, false);
  assert.equal(detectSuspiciousDuration('Amman', 'QAIA', 0.75).suspicious, false);
});

test('detectSuspiciousDuration: ignores null/zero/undefined', () => {
  assert.equal(detectSuspiciousDuration('Amman', 'Petra', null).suspicious, false);
  assert.equal(detectSuspiciousDuration('Amman', 'Petra', undefined).suspicious, false);
  assert.equal(detectSuspiciousDuration('Amman', 'Petra', 0).suspicious, false);
});

test('detectSuspiciousDuration: any > 12 h is unconditionally suspicious (no Jordan transfer)', () => {
  const result = detectSuspiciousDuration('UnknownA', 'UnknownB', 14);
  assert.equal(result.suspicious, true);
  assert.match(result.reason || '', /exceeds 12 h/);
});

// -----------------------------------------------------------------------
// previewCanonicalization + applyCanonicalization
// -----------------------------------------------------------------------
test('previewCanonicalization: surfaces messy codes, duplicates, and suspicious durations', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'id-1',
      routeCode: 'JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT',
      routeName: 'Amman to QAIA',
      fromCity: 'Amman City',
      toCity: 'QAIA Airport',
      standardDurationHours: 1.0,
      standardDistanceKm: 35,
      isActive: true,
      canonicalRouteCode: null,
      reviewStatus: null,
    },
    {
      id: 'id-2',
      routeCode: 'AMM_QAIA',
      routeName: 'Amman to Queen Alia',
      fromCity: 'Amman',
      toCity: 'QAIA',
      standardDurationHours: 0.9,
      standardDistanceKm: 32,
      isActive: true,
      canonicalRouteCode: null,
      reviewStatus: null,
    },
    {
      id: 'id-3',
      routeCode: 'DS_PET_OLDCODE',
      routeName: 'Dead Sea to Petra',
      fromCity: 'Dead Sea',
      toCity: 'Petra',
      standardDurationHours: 11, // suspicious (excursion length)
      standardDistanceKm: 230,
      isActive: true,
      canonicalRouteCode: null,
      reviewStatus: null,
    },
  ]);
  const service = new RouteStandardsService(prisma as any);
  const preview = await service.previewCanonicalization();

  // Duplicates: id-1 + id-2 both map to AMM_QAIA
  assert.equal(preview.duplicateGroups.length, 1);
  assert.equal(preview.duplicateGroups[0].canonicalRouteCode, 'AMM_QAIA');
  assert.equal(preview.duplicateGroups[0].members.length, 2);

  // Counters
  assert.equal(preview.counters.suspiciousDuration, 1);
  assert.equal(preview.counters.duplicateCanonicalCodes, 1);
  assert.equal(preview.counters.messyCode, 1); // id-1 has the verbose bootstrap code
});

test('applyCanonicalization: writes canonicalRouteCode + reviewStatus without modifying routeCode', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'id-1',
      routeCode: 'JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT',
      routeName: 'Amman to QAIA',
      fromCity: 'Amman City',
      toCity: 'QAIA',
      standardDurationHours: 1.0,
      standardDistanceKm: 35,
      isActive: true,
      canonicalRouteCode: null,
      reviewStatus: null,
    },
  ]);
  const service = new RouteStandardsService(prisma as any);
  const result = await service.applyCanonicalization();

  assert.equal(result.assignedCanonical, 1);
  assert.equal(result.markedCanonicalized, 1);

  // Legacy routeCode preserved — critical for migration safety.
  const row = (prisma as any).__store[0];
  assert.equal(row.routeCode, 'JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT');
  assert.equal(row.canonicalRouteCode, 'AMM_QAIA');
  assert.equal(row.reviewStatus, 'CANONICALIZED');
});

test('applyCanonicalization: never downgrades VERIFIED rows', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'id-1',
      routeCode: 'AMM_PET',
      routeName: 'Amman to Petra',
      fromCity: 'Amman',
      toCity: 'Petra',
      standardDurationHours: 11, // suspicious — would normally flag REVIEW_REQUIRED
      standardDistanceKm: 235,
      isActive: true,
      canonicalRouteCode: 'AMM_PET',
      reviewStatus: 'VERIFIED', // operator already signed off
    },
  ]);
  const service = new RouteStandardsService(prisma as any);
  await service.applyCanonicalization();
  // VERIFIED stays VERIFIED — operator's signoff is sticky even if the
  // duration looks suspicious to the auto-detector.
  assert.equal((prisma as any).__store[0].reviewStatus, 'VERIFIED');
  // But the suspicious flag is still recomputed honestly so the dashboard
  // can show "verified but still suspicious — investigate".
  assert.equal((prisma as any).__store[0].suspiciousDurationFlag, true);
});

// -----------------------------------------------------------------------
// mergeDuplicates safety
// -----------------------------------------------------------------------
test('mergeDuplicates: soft-deactivates duplicates without deleting them (operational history intact)', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'id-1',
      routeCode: 'AMM_QAIA',
      routeName: 'Amman to QAIA',
      fromCity: 'Amman',
      toCity: 'QAIA',
      standardDurationHours: 0.9,
      standardDistanceKm: 32,
      isActive: true,
      operationalBufferMinutes: 30,
    },
    {
      id: 'id-2',
      routeCode: 'JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT',
      routeName: 'Amman to QAIA (long)',
      fromCity: 'Amman',
      toCity: 'QAIA',
      standardDurationHours: 1.0,
      standardDistanceKm: 35,
      isActive: true,
      operationalBufferMinutes: null, // gets backfilled from target
    },
  ]);
  const service = new RouteStandardsService(prisma as any);
  const result = await service.mergeDuplicates('id-1', ['id-2']);

  assert.equal(result.mergedCount, 1);
  assert.equal(result.canonicalRouteCode, 'AMM_QAIA');

  // Target promoted to VERIFIED + active.
  const target = (prisma as any).__store.find((r: any) => r.id === 'id-1');
  assert.equal(target.isActive, true);
  assert.equal(target.reviewStatus, 'VERIFIED');

  // Duplicate is soft-deactivated, NOT deleted. Operational history
  // captured against routeCode='JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT'
  // can still be looked up if needed.
  const duplicate = (prisma as any).__store.find((r: any) => r.id === 'id-2');
  assert.equal(duplicate.isActive, false);
  assert.equal(duplicate.reviewStatus, 'CANONICALIZED');
  assert.equal(duplicate.routeCode, 'JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT'); // untouched
});

test('mergeDuplicates: backfills missing fields on the target from duplicates', async () => {
  const prisma = buildFakePrisma([
    {
      id: 'id-1',
      routeCode: 'AMM_QAIA',
      routeName: 'Amman to QAIA',
      fromCity: 'Amman',
      toCity: 'QAIA',
      standardDurationHours: null, // missing
      standardDistanceKm: null, // missing
      operationalBufferMinutes: null,
      isActive: true,
    },
    {
      id: 'id-2',
      routeCode: 'AMMAN_TO_QAIA_LONG',
      routeName: 'Long form',
      fromCity: 'Amman',
      toCity: 'QAIA',
      standardDurationHours: 1.0,
      standardDistanceKm: 35,
      operationalBufferMinutes: 20,
      isActive: true,
    },
  ]);
  const service = new RouteStandardsService(prisma as any);
  await service.mergeDuplicates('id-1', ['id-2']);

  const target = (prisma as any).__store.find((r: any) => r.id === 'id-1');
  assert.equal(target.standardDurationHours, 1.0);
  assert.equal(target.standardDistanceKm, 35);
  assert.equal(target.operationalBufferMinutes, 20);
});

test('mergeDuplicates: refuses to merge when target id is in the merged list', async () => {
  const prisma = buildFakePrisma([
    { id: 'id-1', routeCode: 'A', routeName: 'A', isActive: true },
    { id: 'id-2', routeCode: 'B', routeName: 'B', isActive: true },
  ]);
  const service = new RouteStandardsService(prisma as any);
  await assert.rejects(
    () => service.mergeDuplicates('id-1', ['id-1', 'id-2']),
    /Target cannot also be in the merged list/,
  );
});

// -----------------------------------------------------------------------
// Legacy lookup resolution after canonicalization
// -----------------------------------------------------------------------
test('legacy lookup: bookings created with the messy bootstrap code STILL resolve to the canonicalized standard', async () => {
  // Simulate a booking that captured the long form before canonicalization.
  // After we assign canonicalRouteCode + keep routeCode untouched, the
  // lookup helper (which now queries BOTH columns) should still find the
  // standard via the original routeCode.
  const fakePrisma = {
    quoteItem: { findMany: async () => [] },
    route: { findMany: async () => [] },
    routeStandard: {
      findMany: async ({ where }: any) => {
        const orClauses = where?.OR || [];
        const codes = new Set<string>();
        for (const clause of orClauses) {
          for (const c of clause?.routeCode?.in || []) codes.add(c);
          for (const c of clause?.canonicalRouteCode?.in || []) codes.add(c);
        }
        const all = [
          {
            id: 'standard-1',
            routeCode: 'JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT', // legacy code captured on the booking
            canonicalRouteCode: 'AMM_QAIA', // assigned by canonicalization
            routeName: 'Amman to QAIA',
            standardDurationHours: 1.0,
            standardDistanceKm: 35,
            operationalBufferMinutes: 30,
            longDistanceFlag: false,
            overnightRisk: false,
            mountainRoadFlag: false,
            borderCrossingFlag: false,
            airportRouteFlag: true,
            notes: null,
            isActive: true,
          },
        ];
        return all.filter(
          (s) => codes.has(s.routeCode) || (s.canonicalRouteCode && codes.has(s.canonicalRouteCode)),
        );
      },
    },
  };

  // Booking still carries the long bootstrap code on its touringRoute.
  const services = [{ id: 'svc-1', touringRoute: { code: 'JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT' } }];
  const result = await loadRouteStandardsForBookingServices(fakePrisma as any, services);
  assert.equal(result.size, 1);
  assert.equal(result.get('svc-1')?.routeCode, 'JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT');
  assert.equal(result.get('svc-1')?.canonicalRouteCode, 'AMM_QAIA');
  // Dispatch / vouchers can now prefer canonicalRouteCode for the
  // operator-facing label while keeping legacy resolution intact.
});

test('legacy lookup: bookings that captured the canonical code ALSO resolve to the same standard', async () => {
  // Newer bookings (or migrated touring routes) may store the canonical
  // FROM_TO short form directly. Lookup must find the same standard either
  // way — that's the whole point of dual-key resolution.
  const fakePrisma = {
    quoteItem: { findMany: async () => [] },
    route: { findMany: async () => [] },
    routeStandard: {
      findMany: async ({ where }: any) => {
        const orClauses = where?.OR || [];
        const codes = new Set<string>();
        for (const clause of orClauses) {
          for (const c of clause?.routeCode?.in || []) codes.add(c);
          for (const c of clause?.canonicalRouteCode?.in || []) codes.add(c);
        }
        const all = [
          {
            id: 'standard-1',
            routeCode: 'JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT',
            canonicalRouteCode: 'AMM_QAIA',
            routeName: 'Amman to QAIA',
            standardDurationHours: 1.0,
            standardDistanceKm: 35,
            operationalBufferMinutes: 30,
            longDistanceFlag: false,
            overnightRisk: false,
            mountainRoadFlag: false,
            borderCrossingFlag: false,
            airportRouteFlag: true,
            notes: null,
            isActive: true,
          },
        ];
        return all.filter(
          (s) => codes.has(s.routeCode) || (s.canonicalRouteCode && codes.has(s.canonicalRouteCode)),
        );
      },
    },
  };

  const services = [{ id: 'svc-2', touringRoute: { code: 'AMM_QAIA' } }];
  const result = await loadRouteStandardsForBookingServices(fakePrisma as any, services);
  assert.equal(result.size, 1);
  assert.equal(result.get('svc-2')?.canonicalRouteCode, 'AMM_QAIA');
});

test('bootstrap reruns idempotently: no duplicates created on second invocation', async () => {
  // The bootstrap method already guards on existingCodes; reconfirm that
  // contract didn't regress with the cleanup changes.
  const prisma = buildFakePrisma([]);
  (prisma as any).touringRoute = {
    findMany: async () => [
      {
        code: 'AMM_PET',
        name: 'Amman to Petra',
        startCity: 'Amman',
        estimatedDistanceKm: 235,
        estimatedDriveHours: 3.5,
        active: true,
      },
    ],
  };
  (prisma as any).route = { findMany: async () => [] };
  const service = new RouteStandardsService(prisma as any);
  const first = await service.bootstrapFromExistingRoutes();
  const second = await service.bootstrapFromExistingRoutes();
  assert.equal(first.createdTotal, 1);
  assert.equal(second.createdTotal, 0);
  assert.equal(second.skippedExistingByCode, 1);
});

test('bootstrap: tags suspicious-duration rows as REVIEW_REQUIRED on creation', async () => {
  const prisma = buildFakePrisma([]);
  (prisma as any).touringRoute = {
    findMany: async () => [
      {
        code: 'DS_PET',
        name: 'Dead Sea to Petra',
        startCity: 'Dead Sea',
        estimatedDistanceKm: 230,
        estimatedDriveHours: 11, // suspicious (excursion day length)
        active: true,
      },
    ],
  };
  (prisma as any).route = { findMany: async () => [] };
  const service = new RouteStandardsService(prisma as any);
  const result = await service.bootstrapFromExistingRoutes();
  assert.equal(result.createdTotal, 1);
  assert.equal(result.suspiciousDurationCount, 1);
  const row = (prisma as any).__store[0];
  assert.equal(row.reviewStatus, 'REVIEW_REQUIRED');
  assert.equal(row.suspiciousDurationFlag, true);
});
