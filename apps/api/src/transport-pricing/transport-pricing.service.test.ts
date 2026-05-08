import test = require('node:test');
import assert = require('node:assert/strict');
import { TransportPricingService } from './transport-pricing.service';
import { normalizeVehicleTypeLabel } from '../common/vehicle-type-normalization';

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

test('transport pricing resolves the smallest active capacity that fits pax before larger vehicles', async () => {
  let findFirstArgs: any;
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
      findFirst: async (args: any) => {
        findFirstArgs = args;
        return buildRule({});
      },
    },
  } as any);

  const resolved = await service.resolvePricingRule({
    routeId: 'route-1',
    transportServiceTypeId: 'service-transfer',
    pax: 2,
  });

  assert.equal(findFirstArgs.orderBy[0].unitCapacity, 'asc');
  assert.equal(resolved.rule.vehicle.name, 'Car');
  assert.equal(resolved.unitCount, 1);
  assert.equal(resolved.calculatedCost, 45);
});

test('transport pricing preserves a user-selected vehicle during quote save', async () => {
  let findFirstArgs: any;
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
      findFirst: async (args: any) => {
        findFirstArgs = args;
        return buildRule({
          id: 'rule-minivan',
          vehicleId: 'vehicle-minivan',
          unitCapacity: 6,
          baseCost: 60,
          vehicle: { id: 'vehicle-minivan', name: 'Mini Van', maxPax: 6, luggageCapacity: 6 },
        });
      },
    },
  } as any);

  const resolved = await service.resolvePricingRule({
    routeId: 'route-1',
    transportServiceTypeId: 'service-transfer',
    vehicleId: 'vehicle-minivan',
    pax: 3,
  });

  assert.equal(findFirstArgs.where.vehicleId, 'vehicle-minivan');
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
