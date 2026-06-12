import test = require('node:test');
import assert = require('node:assert/strict');
import { TransportPricingService } from './transport-pricing.service';
import { normalizeVehicleTypeLabel } from '../common/vehicle-type-normalization';
import { normalizeRouteName } from '../routes/route-normalization';

function buildRule(overrides: Record<string, unknown>) {
  return {
    id: 'rule-car',
    routeId: 'route-1',
    transportServiceTypeId: 'service-transfer',
    vehicleId: 'vehicle-car',
    supplierId: 'supplier-1',
    pricingMode: 'capacity_unit',
    minPax: 1,
    maxPax: 999,
    unitCapacity: 2,
    baseCost: 45,
    discountPercent: 0,
    currency: 'JOD',
    route: { id: 'route-1', name: 'Amman -> Petra' },
    supplier: { id: 'supplier-1', name: 'Almushtari' },
    transportServiceType: {
      id: 'service-transfer',
      name: 'Private Transfer',
      code: 'PRIVATE_TRANSFER',
      classification: 'ROUTE_TRANSFER',
    },
    vehicle: { id: 'vehicle-car', name: 'Car', maxPax: 2, luggageCapacity: 2 },
    ...overrides,
  } as any;
}

test('transport pricing resolves the cheapest total rule, preferring a single coach over a multi-vehicle split', async () => {
  const service = new TransportPricingService({
    route: {
      findUnique: async () => ({
        id: 'route-1',
        fromPlaceId: 'from-1',
        toPlaceId: 'to-1',
        fromPlace: { id: 'from-1', name: 'Amman' },
        toPlace: { id: 'to-1', name: 'Petra' },
      }),
    },
    transportPricingRule: {
      findMany: async () => [
        buildRule({}),
        buildRule({
          id: 'rule-minivan',
          vehicleId: 'vehicle-minivan',
          unitCapacity: 6,
          baseCost: 60,
          vehicle: { id: 'vehicle-minivan', name: 'Mini Van', maxPax: 6, luggageCapacity: 6 },
        }),
      ],
    },
  } as any);

  const resolved = await service.resolvePricingRule({
    routeId: 'route-1',
    transportServiceTypeId: 'service-transfer',
    pax: 6,
  });

  // Car (capacity 2) needs 3 units = 135 JOD; the Mini Van fits 6 in a single
  // unit = 60 JOD — the cheaper single vehicle wins over the multi-vehicle split.
  assert.equal(resolved.rule.vehicle.name, 'Mini Van');
  assert.equal(resolved.unitCount, 1);
  assert.equal(resolved.calculatedCost, 60);
});

test('transport pricing preserves a user-selected vehicle during quote save', async () => {
  const service = new TransportPricingService({
    route: {
      findUnique: async () => ({
        id: 'route-1',
        fromPlaceId: 'from-1',
        toPlaceId: 'to-1',
        fromPlace: { id: 'from-1', name: 'Amman' },
        toPlace: { id: 'to-1', name: 'Petra' },
      }),
    },
    transportPricingRule: {
      findMany: async () => [
        // A cheaper Car rule exists, but the pinned vehicle must win regardless.
        buildRule({}),
        buildRule({
          id: 'rule-minivan',
          vehicleId: 'vehicle-minivan',
          unitCapacity: 6,
          baseCost: 60,
          vehicle: { id: 'vehicle-minivan', name: 'Mini Van', maxPax: 6, luggageCapacity: 6 },
        }),
      ],
    },
  } as any);

  const resolved = await service.resolvePricingRule({
    routeId: 'route-1',
    transportServiceTypeId: 'service-transfer',
    vehicleId: 'vehicle-minivan',
    pax: 3,
  });

  assert.equal(resolved.rule.vehicle.name, 'Mini Van');
  assert.equal(resolved.unitCount, 1);
});

test('legacy supplier vehicle types normalize to canonical quote picker types', () => {
  assert.equal(normalizeVehicleTypeLabel('Medium 30'), 'Coach');
  assert.equal(normalizeVehicleTypeLabel('Large 49'), 'Coach');
  assert.equal(normalizeVehicleTypeLabel('Small 17'), 'Mini Bus');
  assert.equal(normalizeVehicleTypeLabel('Mini Van 5'), 'Mini Van');
  assert.equal(normalizeVehicleTypeLabel('Van VIP 9'), 'Van');
  assert.equal(normalizeVehicleTypeLabel('Large VVIP 29'), 'Coach');
  assert.equal(normalizeVehicleTypeLabel('Mercedes Grand Star 49 Pax'), 'Coach');
  assert.equal(normalizeVehicleTypeLabel('Toyota Coaster'), 'Mini Bus');
});

test('transport pricing falls back from selected Coach vehicle to legacy coach-like rate vehicle', async () => {
  const route = {
    id: 'route-aqaba-petra',
    name: 'Aqaba -> Petra',
    normalizedKey: 'aqaba-petra',
    fromPlaceId: 'aqaba',
    toPlaceId: 'petra',
    fromPlace: { id: 'aqaba', name: 'Aqaba' },
    toPlace: { id: 'petra', name: 'Petra' },
  };
  const service = new TransportPricingService({
    route: {
      findUnique: async () => route,
    },
    vehicle: {
      findUnique: async () => ({ id: 'vehicle-coach', name: 'Coach', vehicleType: 'Coach' }),
    },
    transportPricingRule: {
      findFirst: async () => null,
      findMany: async () => [
        buildRule({
          id: 'rule-medium-30',
          routeId: route.id,
          vehicleId: 'vehicle-medium-30',
          unitCapacity: 30,
          baseCost: 300,
          route,
          vehicle: { id: 'vehicle-medium-30', name: 'Medium 30', vehicleType: 'Medium 30', maxPax: 30, luggageCapacity: 30 },
        }),
      ],
    },
  } as any);

  const resolved = await service.resolvePricingRule({
    routeId: route.id,
    transportServiceTypeId: 'service-transfer',
    vehicleId: 'vehicle-coach',
    pax: 21,
  });

  assert.equal(resolved.rule.vehicle.name, 'Medium 30');
  assert.equal(resolved.calculatedCost, 300);
});

test('vehicle rate lookup keeps route id first and adds normalized route label fallback', async () => {
  let findFirstArgs: any;
  const route = {
    id: 'route-selected',
    name: 'Petra -> Amman',
    fromPlaceId: 'petra',
    toPlaceId: 'amman',
    fromPlace: { id: 'petra', name: 'Petra' },
    toPlace: { id: 'amman', name: 'Amman' },
  };
  const service = new TransportPricingService({
    route: {
      findUnique: async () => route,
    },
    vehicleRate: {
      findFirst: async (args: any) => {
        findFirstArgs = args;
        return {
          id: 'rate-petra-amman',
          vehicleId: 'vehicle-medium-30',
          routeId: 'legacy-route-id',
          routeName: 'Petra to Amman',
          minPax: 1,
          maxPax: 30,
          price: 250,
          currency: 'USD',
          active: true,
          validFrom: new Date('2026-01-01'),
          validTo: new Date('2026-12-31'),
          vehicle: { id: 'vehicle-medium-30', name: 'Medium 30', maxPax: 30, luggageCapacity: 30 },
          serviceType: { id: 'service-transfer', name: 'Private Transfer', code: 'PRIVATE_TRANSFER', classification: 'ROUTE_TRANSFER' },
          supplier: { id: 'supplier-1', name: 'Alpha' },
          route: null,
          fromPlace: null,
          toPlace: null,
        };
      },
    },
  } as any);

  await service.findMatchingRate({
    serviceTypeId: 'service-transfer',
    routeId: route.id,
    paxCount: 21,
  });

  assert.equal(findFirstArgs.where.OR[0].routeId, route.id);
  assert.deepEqual(findFirstArgs.where.OR[2], {
    AND: [
      { routeName: { contains: 'Petra', mode: 'insensitive' } },
      { routeName: { contains: 'Amman', mode: 'insensitive' } },
    ],
  });
});

test('vehicle rate lookup prefers selected vehicleRateId for persisted picker saves', async () => {
  const route = {
    id: 'route-amman-city',
    name: 'Amman -> Amman',
    fromPlaceId: 'amman',
    toPlaceId: 'amman',
    fromPlace: { id: 'amman', name: 'Amman' },
    toPlace: { id: 'amman', name: 'Amman' },
  };
  const service = new TransportPricingService({
    route: {
      findUnique: async () => route,
    },
    vehicleRate: {
      findFirst: async (args: any) =>
        args.where.id === 'rate-full-day'
          ? {
              id: 'rate-full-day',
              vehicleId: 'vehicle-medium-30',
              routeId: route.id,
              routeName: 'Amman City',
              minPax: 1,
              maxPax: 30,
              price: 320,
              currency: 'USD',
              active: true,
              validFrom: new Date('2026-01-01'),
              validTo: new Date('2026-12-31'),
              vehicle: { id: 'vehicle-medium-30', name: 'Medium 30', vehicleType: 'Medium 30', maxPax: 30 },
              serviceType: { id: 'service-full-day', name: 'Full Day', code: 'FULL_DAY', classification: 'FULL_DAY' },
              supplier: { id: 'supplier-alpha', name: 'Alpha' },
              route,
              fromPlace: null,
              toPlace: null,
            }
          : null,
    },
  } as any);

  const rate = await service.findMatchingRate({
    serviceTypeId: 'service-full-day',
    vehicleRateId: 'rate-full-day',
    vehicleId: 'vehicle-coach',
    routeId: route.id,
    paxCount: 21,
  });

  assert.equal(rate.id, 'rate-full-day');
  assert.equal(rate.serviceType.name, 'Full Day');
});

test('vehicle rate lookup falls back to service-area label and canonical coach vehicle', async () => {
  const route = {
    id: 'route-amman-city',
    name: 'Amman -> Amman',
    normalizedKey: 'amman_amman',
    fromPlaceId: 'amman',
    toPlaceId: 'amman',
    fromPlace: { id: 'amman', name: 'Amman' },
    toPlace: { id: 'amman', name: 'Amman' },
  };
  const service = new TransportPricingService({
    route: {
      findUnique: async () => route,
    },
    vehicle: {
      findUnique: async () => ({ id: 'vehicle-coach', name: 'Coach', vehicleType: 'Coach' }),
    },
    vehicleRate: {
      findFirst: async () => null,
      findMany: async () => [
        {
          id: 'rate-full-day',
          vehicleId: 'vehicle-medium-30',
          routeId: null,
          routeName: 'Amman City',
          minPax: 1,
          maxPax: 30,
          price: 320,
          currency: 'USD',
          active: true,
          validFrom: new Date('2026-01-01'),
          validTo: new Date('2026-12-31'),
          vehicle: { id: 'vehicle-medium-30', name: 'Medium 30', vehicleType: 'Medium 30', maxPax: 30 },
          serviceType: { id: 'service-full-day', name: 'Full Day', code: 'FULL_DAY', classification: 'FULL_DAY' },
          supplier: { id: 'supplier-alpha', name: 'Alpha' },
          route: null,
          fromPlace: null,
          toPlace: null,
        },
      ],
    },
  } as any);

  const rate = await service.findMatchingRate({
    serviceTypeId: 'service-full-day',
    vehicleId: 'vehicle-coach',
    routeId: route.id,
    routeName: 'Amman City',
    paxCount: 21,
  });

  assert.equal(rate.id, 'rate-full-day');
  assert.equal(rate.vehicle.name, 'Medium 30');
});

test('route normalization treats imported supplier route labels as equivalent', () => {
  const equivalentRoutes = ['Petra → Amman', 'Petra - Amman', 'Petra / Amman', 'Petra to Amman', 'Petra to Amman (1 day)'];

  assert.deepEqual(Array.from(new Set(equivalentRoutes.map(normalizeRouteName))), ['petra_amman']);
  assert.equal(normalizeRouteName('Aqaba South Border → Petra'), normalizeRouteName('Aqaba South Border to Petra (1 day)'));
  assert.notEqual(normalizeRouteName('Petra → Amman'), normalizeRouteName('Amman → Aqaba'));
});

// ---------------------------------------------------------------------------
// Bugfix — ADD_ON VehicleRates must never be applied as the PRIMARY transport rate
// ---------------------------------------------------------------------------
function addOnRate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rate-petra-overnight',
    vehicleId: 'vehicle-sedan',
    routeId: 'route-amman',
    routeName: 'Jordan Program',
    minPax: 1,
    maxPax: 999,
    price: 15,
    currency: 'JOD',
    active: true,
    validFrom: new Date('2026-01-01'),
    validTo: new Date('2026-12-31'),
    vehicle: { id: 'vehicle-sedan', name: 'Sedan 2', vehicleType: 'Sedan', maxPax: 2 },
    serviceType: { id: 'st-petra-overnight', name: 'Petra Overnight', code: 'PETRA_OVERNIGHT', classification: 'ADD_ON' },
    supplier: { id: 'supplier-almushtari', name: 'Almushtari Logistics Services' },
    route: null,
    fromPlace: null,
    toPlace: null,
    ...overrides,
  };
}

test('findMatchingRate rejects an ADD_ON (Petra Overnight) vehicleRateId as primary transport', async () => {
  const service = new TransportPricingService({
    route: { findUnique: async () => ({ id: 'route-amman', name: 'QAIA -> Amman', fromPlaceId: 'qaia', toPlaceId: 'amman', fromPlace: { id: 'qaia', name: 'QAIA' }, toPlace: { id: 'amman', name: 'Amman' } }) },
    vehicleRate: { findFirst: async () => addOnRate(), findMany: async () => [] },
  } as any);

  await assert.rejects(
    () => service.findMatchingRate({ serviceTypeId: 'st-petra-overnight', vehicleRateId: 'rate-petra-overnight', routeId: 'route-amman', paxCount: 2 }),
    /add-on transport rate.*cannot be applied as the primary transport rate/i,
  );
});

test('findMatchingRate rejects a STATIONARY_WAITING ADD_ON vehicleRateId as primary transport', async () => {
  const service = new TransportPricingService({
    route: { findUnique: async () => ({ id: 'route-amman', name: 'QAIA -> Amman', fromPlaceId: 'qaia', toPlaceId: 'amman', fromPlace: { id: 'qaia', name: 'QAIA' }, toPlace: { id: 'amman', name: 'Amman' } }) },
    vehicleRate: {
      findFirst: async () => addOnRate({
        id: 'rate-stationary',
        serviceType: { id: 'st-stationary', name: 'Stationary / Waiting', code: 'STATIONARY_WAITING', classification: 'ADD_ON' },
        price: 40,
      }),
      findMany: async () => [],
    },
  } as any);

  await assert.rejects(
    () => service.findMatchingRate({ serviceTypeId: 'st-stationary', vehicleRateId: 'rate-stationary', routeId: 'route-amman', paxCount: 2 }),
    /add-on transport rate.*cannot be applied as the primary transport rate/i,
  );
});

test('findMatchingRate fallback never selects an ADD_ON rate even when it is the cheapest', async () => {
  // findMany returns a cheap ADD_ON (15) + a legitimate route-transfer (30). The
  // cheapest-fitting picker would grab the 15 ADD_ON without the guard; with the
  // guard it must pick the 30 primary rate.
  const primary = addOnRate({
    id: 'rate-suv-airport',
    price: 30,
    vehicle: { id: 'vehicle-suv', name: 'SUV 4', vehicleType: 'SUV', maxPax: 4 },
    serviceType: { id: 'st-airport', name: 'Airport Transfer', code: 'AIRPORT_TRANSFER', classification: 'ROUTE_TRANSFER' },
  });
  const service = new TransportPricingService({
    route: { findUnique: async () => ({ id: 'route-amman', name: 'QAIA -> Amman', fromPlaceId: 'qaia', toPlaceId: 'amman', fromPlace: { id: 'qaia', name: 'QAIA' }, toPlace: { id: 'amman', name: 'Amman' } }) },
    vehicleRate: {
      findFirst: async () => null,
      findMany: async () => [addOnRate({ id: 'rate-overnight-cheap', price: 15 }), primary],
    },
  } as any);

  const rate = await service.findMatchingRate({ serviceTypeId: 'st-airport', routeId: 'route-amman', paxCount: 4 });
  assert.equal(rate.id, 'rate-suv-airport');
  assert.equal(rate.serviceType.classification, 'ROUTE_TRANSFER');
});

test('findMatchingRate still returns a legitimate non-ADD_ON vehicleRateId (package full-day pin unaffected)', async () => {
  const service = new TransportPricingService({
    route: { findUnique: async () => ({ id: 'route-amman', name: 'QAIA -> Amman', fromPlaceId: 'qaia', toPlaceId: 'amman', fromPlace: { id: 'qaia', name: 'QAIA' }, toPlace: { id: 'amman', name: 'Amman' } }) },
    vehicleRate: {
      findFirst: async () => addOnRate({
        id: 'rate-disposal-sedan',
        price: 75,
        routeName: 'Jordan Program',
        serviceType: { id: 'st-daily', name: 'Daily Full Day', code: 'DAILY_FULL_DAY', classification: 'DAILY_PACKAGE' },
      }),
      findMany: async () => [],
    },
  } as any);

  const rate = await service.findMatchingRate({ serviceTypeId: 'st-daily', vehicleRateId: 'rate-disposal-sedan', routeId: 'route-amman', paxCount: 2 });
  assert.equal(rate.id, 'rate-disposal-sedan');
  assert.equal(rate.price, 75);
});
