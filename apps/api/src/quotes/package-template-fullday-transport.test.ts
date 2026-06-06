import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuotesService } from './quotes.service';

// Phase B / B.1 — routeless FULL_DAY / HALF_DAY / DAILY_PACKAGE transport apply
// mapping. The component carries no route; we resolve the cheapest fitting active
// VehicleRate for its service type directly (prisma.vehicleRate.findFirst) and
// price via the rate's OWN real route. No engine change, no invented route.

// Generic transport supplier service (taxonomy resolves to "transport" via name).
const TRANSPORT_SERVICE = {
  id: 'svc-transport',
  name: 'Transport service',
  category: 'transport',
  serviceType: { name: 'Transport service' },
};

// Cheapest fitting full-day rate (Sedan 2 @ 75 JOD), attached to the supplier's
// own real disposal route (Amman -> Amman / Jordan Program).
const SEDAN_RATE = {
  id: 'vr-sedan',
  routeId: 'route-amman-amman',
  routeName: 'Jordan Program',
  currency: 'JOD',
  price: 75,
  minPax: 1,
  maxPax: 2,
  vehicleId: 'veh-sedan',
  vehicle: { id: 'veh-sedan', name: 'Sedan 2' },
};

const QUOTE = { id: 'q1', adults: 2, children: 0, travelStartDate: '2026-05-29' };

function makeService(opts: {
  vehicleRate?: (args: any) => Promise<any>;
  findMatchingRate?: (input: any) => Promise<any>;
  touringRoute?: () => Promise<any>;
} = {}) {
  const vrCalls: any[] = [];
  const rateCalls: any[] = [];
  const prisma: any = {};
  if (opts.vehicleRate) {
    prisma.vehicleRate = { findFirst: async (args: any) => { vrCalls.push(args); return opts.vehicleRate!(args); } };
  }
  if (opts.touringRoute) {
    prisma.touringRoute = { findUnique: async () => opts.touringRoute!() };
  }
  // No prisma.route mock: if the code ever tried to create/lookup a route, it
  // would throw — so these tests also prove no artificial route is created.
  const transportPricing = {
    findMatchingRate: async (input: any) => { rateCalls.push(input); return opts.findMatchingRate ? opts.findMatchingRate(input) : null; },
  };
  const service = new QuotesService(prisma, {} as any, transportPricing as any, {} as any, {} as any);
  return { service, vrCalls, rateCalls };
}

function fullDayComponent(overrides: any = {}) {
  return {
    id: 'comp-fd',
    componentType: 'TRANSPORT',
    label: 'Daily FD rate (Minimum 2 Full days Program)',
    transportServiceTypeId: 'st-fd',
    transportServiceType: { id: 'st-fd', name: 'Daily Full Day', classification: 'FULL_DAY' },
    supplierService: TRANSPORT_SERVICE,
    routeId: null,
    touringRouteId: null,
    pricingMode: 'Full Day',
    ...overrides,
  };
}

test('Phase B.1: routeless FULL_DAY component resolves a real VehicleRate (no component route)', async () => {
  const { service, vrCalls, rateCalls } = makeService({ vehicleRate: async () => SEDAN_RATE });
  const mapping = await (service as any).resolvePackageTransportMapping(fullDayComponent(), QUOTE);

  assert.ok(mapping, 'should resolve a mapping');
  assert.equal(mapping.vehicleRateId, 'vr-sedan'); // Sedan 2 @ 75 JOD
  assert.equal(mapping.transportServiceTypeId, 'st-fd');
  assert.equal(mapping.serviceId, 'svc-transport');
  assert.equal(mapping.currency, 'JOD');
  assert.equal(mapping.dayCount, 1);
  assert.equal(mapping.routeId, 'route-amman-amman', "carries the rate's OWN real routeId");
  assert.equal(mapping.routeName, 'Jordan Program');

  // The VehicleRate was resolved directly by service type + pax + date; NO route input.
  assert.equal(vrCalls.length, 1);
  assert.equal(vrCalls[0].where.serviceTypeId, 'st-fd');
  assert.equal(vrCalls[0].where.minPax.lte, 2);
  assert.equal(vrCalls[0].where.maxPax.gte, 2);
  assert.ok(vrCalls[0].where.validFrom && vrCalls[0].where.validTo, 'date validity filter applied');
  assert.deepEqual(vrCalls[0].orderBy, [{ maxPax: 'asc' }, { price: 'asc' }, { minPax: 'desc' }], 'cheapest fitting ordering');
  // findMatchingRate (the route-based engine call) is NOT used for full-day resolution.
  assert.equal(rateCalls.length, 0);
});

test('Phase B.1: HALF_DAY classification also resolves via direct VehicleRate', async () => {
  const { service } = makeService({ vehicleRate: async () => SEDAN_RATE });
  const mapping = await (service as any).resolvePackageTransportMapping(
    fullDayComponent({ transportServiceTypeId: 'st-hd', transportServiceType: { id: 'st-hd', name: 'Half Day', classification: 'HALF_DAY' } }),
    QUOTE,
  );
  assert.ok(mapping);
  assert.equal(mapping.vehicleRateId, 'vr-sedan');
  assert.equal(mapping.routeId, 'route-amman-amman');
});

test('Phase B.1: no active full-day rate -> mapping is null (clean skip)', async () => {
  const { service } = makeService({ vehicleRate: async () => null });
  const mapping = await (service as any).resolvePackageTransportMapping(fullDayComponent(), QUOTE);
  assert.equal(mapping, null);
});

test('Phase B.1: point-to-point (ROUTE_TRANSFER) still requires + uses routeId', async () => {
  const ptpRate = { id: 'vr-ptp', routeName: 'A - B', currency: 'USD', price: 50, maxPax: 3, vehicle: { id: 'v', name: 'Sedan' } };
  const { service, rateCalls } = makeService({ findMatchingRate: async () => ptpRate });
  const ptp = fullDayComponent({
    transportServiceTypeId: 'st-ptp',
    transportServiceType: { id: 'st-ptp', name: 'Point to Point', classification: 'ROUTE_TRANSFER' },
  });

  // No routeId + ROUTE_TRANSFER → not a full-day component → must NOT resolve.
  assert.equal(await (service as any).resolvePackageTransportMapping(ptp, QUOTE), null);

  // With routeId → existing route branch resolves and passes routeId to the engine.
  const mapping = await (service as any).resolvePackageTransportMapping({ ...ptp, routeId: 'route-1' }, QUOTE);
  assert.ok(mapping);
  assert.equal(mapping.routeId, 'route-1');
  assert.equal(rateCalls[rateCalls.length - 1].routeId, 'route-1', 'route branch passes routeId to findMatchingRate');
});

test('Phase B.1: touringRoute component still uses the touring-route branch (not full-day)', async () => {
  const { service } = makeService({
    findMatchingRate: async () => SEDAN_RATE,
    touringRoute: async () => ({
      id: 'tr-1', active: true, durationDays: 2, name: 'Amman -> Dana -> Petra', startCity: 'Amman',
      pricings: [{ id: 'pr-1', active: true, minPax: 1, maxPax: 9, baseCost: 190, currency: 'USD', transportServiceTypeId: 'st-tr', vehicle: { name: 'Van' }, supplier: { name: 'Alpha' } }],
    }),
  });
  const comp = fullDayComponent({ touringRouteId: 'tr-1', transportServiceType: { id: 'st-tr', name: 'Touring', classification: 'TOURING_ROUTE' } });
  const mapping = await (service as any).resolvePackageTransportMapping(comp, QUOTE);

  assert.ok(mapping);
  assert.equal(mapping.touringRouteId, 'tr-1');
  assert.equal(mapping.pricingMode, 'Touring route');
  assert.equal(mapping.vehicleRateId, undefined, 'touring branch uses touringRoutePricingId, not a routeless vehicleRate');
});
