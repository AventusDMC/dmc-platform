import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuotesService } from './quotes.service';

// Phase B — routeless FULL_DAY / HALF_DAY / DAILY_PACKAGE transport apply mapping.
// Unit-tests the private resolvePackageTransportMapping branch directly with a
// mocked transportPricingService.findMatchingRate. No DB, no engine change.

// A generic transport supplier service (taxonomy resolves to "transport" via the
// serviceType name). In real apply, FULL_DAY components have no supplierService and
// fall back to the configured TRANSPORT service — same taxonomy group.
const TRANSPORT_SERVICE = {
  id: 'svc-transport',
  name: 'Transport service',
  category: 'transport',
  serviceType: { name: 'Transport service' },
};

const SEDAN_RATE = {
  id: 'vr-sedan',
  routeName: 'Jordan Program',
  currency: 'JOD',
  price: 75,
  maxPax: 2,
  vehicle: { id: 'veh-sedan', name: 'Sedan 2' },
};

const QUOTE = { id: 'q1', adults: 2, children: 0, travelStartDate: '2026-05-29' };

function makeService(findMatchingRate: (input: any) => Promise<any>, prisma: any = {}) {
  const calls: any[] = [];
  const transportPricing = {
    findMatchingRate: async (input: any) => {
      calls.push(input);
      return findMatchingRate(input);
    },
  };
  const service = new QuotesService(
    prisma as any, // prisma
    {} as any, // auditService
    transportPricing as any, // transportPricingService
    {} as any, // promotionsService
    {} as any, // quotePricingService
  );
  return { service, calls };
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

test('Phase B: routeless FULL_DAY component resolves a VehicleRate without routeId', async () => {
  const { service, calls } = makeService(async () => SEDAN_RATE);
  const mapping = await (service as any).resolvePackageTransportMapping(fullDayComponent(), QUOTE);

  assert.ok(mapping, 'should resolve a mapping');
  assert.equal(mapping.vehicleRateId, 'vr-sedan'); // Sedan 2 @ 75 JOD
  assert.equal(mapping.transportServiceTypeId, 'st-fd');
  assert.equal(mapping.serviceId, 'svc-transport');
  assert.equal(mapping.currency, 'JOD');
  assert.equal(mapping.dayCount, 1);
  assert.equal(mapping.routeId, undefined, 'routeless full-day mapping carries no routeId');
  assert.equal(mapping.routeName, 'Jordan Program', 'rate routeName lets createItem route gate pass');

  // findMatchingRate called with serviceTypeId + paxCount + travelDate, NO routeId
  assert.equal(calls.length, 1);
  assert.equal(calls[0].serviceTypeId, 'st-fd');
  assert.equal(calls[0].paxCount, 2);
  assert.ok(calls[0].travelDate instanceof Date, 'travelDate forwarded when available');
  assert.equal(calls[0].routeId, undefined, 'no routeId passed for the full-day match');
});

test('Phase B: HALF_DAY classification also resolves routeless', async () => {
  const { service } = makeService(async () => SEDAN_RATE);
  const mapping = await (service as any).resolvePackageTransportMapping(
    fullDayComponent({ transportServiceTypeId: 'st-hd', transportServiceType: { id: 'st-hd', name: 'Half Day', classification: 'HALF_DAY' } }),
    QUOTE,
  );
  assert.ok(mapping);
  assert.equal(mapping.vehicleRateId, 'vr-sedan');
  assert.equal(mapping.routeId, undefined);
});

test('Phase B: no active full-day rate -> mapping is null (clean skip)', async () => {
  const { service } = makeService(async () => {
    throw new Error('No matching rate');
  });
  const mapping = await (service as any).resolvePackageTransportMapping(fullDayComponent(), QUOTE);
  assert.equal(mapping, null);
});

test('Phase B: point-to-point (ROUTE_TRANSFER) still requires + uses routeId', async () => {
  const ptpRate = { id: 'vr-ptp', routeName: 'A - B', currency: 'USD', price: 50, maxPax: 3, vehicle: { id: 'v', name: 'Sedan' } };
  const { service, calls } = makeService(async () => ptpRate);
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
  assert.equal(calls[calls.length - 1].routeId, 'route-1', 'route branch passes routeId');
});

test('Phase B: touringRoute component still uses the touring-route branch (not full-day)', async () => {
  const prisma = {
    touringRoute: {
      findUnique: async () => ({
        id: 'tr-1', active: true, durationDays: 2, name: 'Amman -> Dana -> Petra', startCity: 'Amman',
        pricings: [{ id: 'pr-1', active: true, minPax: 1, maxPax: 9, baseCost: 190, currency: 'USD', transportServiceTypeId: 'st-tr', vehicle: { name: 'Van' }, supplier: { name: 'Alpha' } }],
      }),
    },
  };
  const { service } = makeService(async () => SEDAN_RATE, prisma);
  const comp = fullDayComponent({ touringRouteId: 'tr-1', transportServiceType: { id: 'st-tr', name: 'Touring', classification: 'TOURING_ROUTE' } });
  const mapping = await (service as any).resolvePackageTransportMapping(comp, QUOTE);

  assert.ok(mapping);
  assert.equal(mapping.touringRouteId, 'tr-1');
  assert.equal(mapping.pricingMode, 'Touring route');
  assert.equal(mapping.vehicleRateId, undefined, 'touring branch uses touringRoutePricingId, not a routeless vehicleRate');
});
