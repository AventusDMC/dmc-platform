import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bufferMinutesFor,
  durationMsFor,
  loadRouteStandardsForBookingServices,
  type RouteStandardLookupValue,
} from './route-standard-lookup';

function buildFakePrisma(opts: {
  quoteItems?: Array<{ id: string; routeId: string | null }>;
  routes?: Array<{ id: string; normalizedKey: string }>;
  standards?: Array<any>;
}) {
  return {
    quoteItem: {
      findMany: async ({ where }: any) => {
        const ids: string[] = where?.id?.in || [];
        return (opts.quoteItems || []).filter((q) => ids.includes(q.id));
      },
    },
    route: {
      findMany: async ({ where }: any) => {
        const ids: string[] = where?.id?.in || [];
        return (opts.routes || []).filter((r) => ids.includes(r.id));
      },
    },
    routeStandard: {
      findMany: async ({ where }: any) => {
        // Cleanup Phase v1 — the lookup helper now uses OR over BOTH
        // routeCode and canonicalRouteCode so legacy bookings whose
        // captured code matches the long form still resolve once
        // canonicalization assigns a FROM_TO short form. Mirror that
        // shape here so tests exercise the real query.
        const orClauses: any[] = where?.OR || (where?.routeCode ? [{ routeCode: where.routeCode }] : []);
        const codes = new Set<string>();
        for (const clause of orClauses) {
          for (const candidate of clause?.routeCode?.in || []) codes.add(candidate);
          for (const candidate of clause?.canonicalRouteCode?.in || []) codes.add(candidate);
        }
        return (opts.standards || []).filter(
          (s) => codes.has(s.routeCode) || (s.canonicalRouteCode && codes.has(s.canonicalRouteCode)),
        );
      },
    },
  };
}

const sampleStandard = (overrides: Partial<RouteStandardLookupValue> & { routeCode: string }) => ({
  routeCode: overrides.routeCode,
  routeName: overrides.routeName || `Route ${overrides.routeCode}`,
  standardDistanceKm: overrides.standardDistanceKm ?? 200,
  standardDurationHours: overrides.standardDurationHours ?? 3,
  operationalBufferMinutes: overrides.operationalBufferMinutes ?? 30,
  longDistanceFlag: overrides.longDistanceFlag ?? false,
  overnightRisk: overrides.overnightRisk ?? false,
  mountainRoadFlag: overrides.mountainRoadFlag ?? false,
  borderCrossingFlag: overrides.borderCrossingFlag ?? false,
  airportRouteFlag: overrides.airportRouteFlag ?? false,
  notes: overrides.notes ?? null,
  isActive: true,
});

test('loadRouteStandardsForBookingServices: empty input returns empty map', async () => {
  const prisma = buildFakePrisma({});
  const result = await loadRouteStandardsForBookingServices(prisma as any, []);
  assert.equal(result.size, 0);
});

test('loadRouteStandardsForBookingServices: matches via touringRoute.code', async () => {
  const prisma = buildFakePrisma({
    standards: [sampleStandard({ routeCode: 'AMM_PET', standardDurationHours: 3.5 })],
  });
  const services = [{ id: 'svc-1', touringRoute: { code: 'AMM_PET' } }];
  const result = await loadRouteStandardsForBookingServices(prisma as any, services);
  assert.equal(result.size, 1);
  assert.equal(result.get('svc-1')?.routeCode, 'AMM_PET');
  assert.equal(result.get('svc-1')?.standardDurationHours, 3.5);
});

test('loadRouteStandardsForBookingServices: matches via QuoteItem -> Route.normalizedKey', async () => {
  const prisma = buildFakePrisma({
    quoteItems: [{ id: 'qi-1', routeId: 'route-1' }],
    routes: [{ id: 'route-1', normalizedKey: 'pet wr' }],
    standards: [sampleStandard({ routeCode: 'PET_WR' })],
  });
  const services = [{ id: 'svc-1', sourceQuoteItemId: 'qi-1' }];
  const result = await loadRouteStandardsForBookingServices(prisma as any, services);
  assert.equal(result.get('svc-1')?.routeCode, 'PET_WR');
});

test('loadRouteStandardsForBookingServices: returns empty when no standard exists', async () => {
  const prisma = buildFakePrisma({
    standards: [], // no standards seeded
  });
  const services = [{ id: 'svc-1', touringRoute: { code: 'UNSEEDED_CODE' } }];
  const result = await loadRouteStandardsForBookingServices(prisma as any, services);
  assert.equal(result.size, 0);
});

test('loadRouteStandardsForBookingServices: touring-route track wins over quote-item track on same service', async () => {
  const prisma = buildFakePrisma({
    quoteItems: [{ id: 'qi-1', routeId: 'route-1' }],
    routes: [{ id: 'route-1', normalizedKey: 'pet wr' }],
    standards: [
      sampleStandard({ routeCode: 'AMM_PET' }),
      sampleStandard({ routeCode: 'PET_WR' }),
    ],
  });
  const services = [{ id: 'svc-1', touringRoute: { code: 'AMM_PET' }, sourceQuoteItemId: 'qi-1' }];
  const result = await loadRouteStandardsForBookingServices(prisma as any, services);
  assert.equal(result.get('svc-1')?.routeCode, 'AMM_PET');
});

test('loadRouteStandardsForBookingServices: confidenceLabel is derived', async () => {
  const prisma = buildFakePrisma({
    standards: [
      sampleStandard({ routeCode: 'PET_DANA', mountainRoadFlag: true }),
      sampleStandard({ routeCode: 'AMM_AQ', longDistanceFlag: true, standardDurationHours: 6 }),
      sampleStandard({ routeCode: 'QAIA_AMM', airportRouteFlag: true }),
    ],
  });
  const services = [
    { id: 'svc-1', touringRoute: { code: 'PET_DANA' } },
    { id: 'svc-2', touringRoute: { code: 'AMM_AQ' } },
    { id: 'svc-3', touringRoute: { code: 'QAIA_AMM' } },
  ];
  const result = await loadRouteStandardsForBookingServices(prisma as any, services);
  assert.equal(result.get('svc-1')?.confidenceLabel, 'Mountain Road Delay Risk');
  assert.equal(result.get('svc-2')?.confidenceLabel, 'Long Distance Drive');
  assert.equal(result.get('svc-3')?.confidenceLabel, 'Heavy Traffic Risk');
});

test('bufferMinutesFor: returns standard buffer when set, fallback otherwise', () => {
  assert.equal(bufferMinutesFor({ operationalBufferMinutes: 45 } as any), 45);
  assert.equal(bufferMinutesFor({ operationalBufferMinutes: null } as any), 30);
  assert.equal(bufferMinutesFor(null), 30);
  assert.equal(bufferMinutesFor(undefined, 60), 60);
});

test('durationMsFor: returns standard duration in ms when set, fallback otherwise', () => {
  assert.equal(durationMsFor({ standardDurationHours: 3.5 } as any, 1.5), 3.5 * 60 * 60 * 1000);
  assert.equal(durationMsFor({ standardDurationHours: null } as any, 1.5), 1.5 * 60 * 60 * 1000);
  assert.equal(durationMsFor(null, 2), 2 * 60 * 60 * 1000);
});
