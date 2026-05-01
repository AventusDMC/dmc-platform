import test = require('node:test');
import assert = require('node:assert/strict');
import { TransportPricingService } from './transport-pricing.service';

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
