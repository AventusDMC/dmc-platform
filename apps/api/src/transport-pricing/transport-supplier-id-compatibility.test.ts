import test = require('node:test');
import assert = require('node:assert/strict');
import { VehicleRatesService } from '../vehicle-rates/vehicle-rates.service';
import { TransportPricingService } from './transport-pricing.service';

function createVehicleRatesPrismaMock() {
  const createdRows: any[] = [];
  const existingRates: any[] = [];
  const serviceType = { id: 'service-type-1', name: 'Full Day', code: 'FULL_DAY', classification: 'FULL_DAY' };

  return {
    createdRows,
    existingRates,
    prisma: {
      supplier: {
        findUnique: async ({ where }: any) => (where.id === 'supplier-1' ? { id: 'supplier-1', name: 'Alpha Transport' } : null),
      },
      vehicle: {
        findUnique: async () => ({ id: 'vehicle-1', name: 'Bus 45', maxPax: 45 }),
      },
      transportServiceType: {
        findUnique: async () => serviceType,
        findFirst: async () => serviceType,
        update: async ({ data }: any) => ({ ...serviceType, ...data }),
      },
      route: {
        findUnique: async ({ where }: any) =>
          where.id === 'route-amman-petra'
            ? {
                id: 'route-amman-petra',
                name: 'Amman -> Petra',
                fromPlaceId: 'place-amman',
                toPlaceId: 'place-petra',
                fromPlace: { id: 'place-amman', name: 'Amman' },
                toPlace: { id: 'place-petra', name: 'Petra' },
              }
            : null,
      },
      vehicleRate: {
        findUnique: async ({ where }: any) => existingRates.find((rate) => rate.id === where.id) || null,
        create: async ({ data }: any) => {
          createdRows.push(data);
          return { id: `rate-${createdRows.length}`, ...data };
        },
      },
      transportPricingRule: {
        findMany: async () => [],
        create: async ({ data }: any) => ({ id: 'pricing-rule-1', ...data }),
        update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      },
    },
  };
}

test('vehicle rates remain creatable without supplierId', async () => {
  const { prisma, createdRows } = createVehicleRatesPrismaMock();
  const service = new VehicleRatesService(prisma as any);

  await service.create({
    vehicleId: 'vehicle-1',
    serviceTypeId: 'service-type-1',
    routeName: 'Amman - Petra',
    minPax: 1,
    maxPax: 45,
    price: 100,
    currency: 'usd',
    validFrom: new Date('2026-04-01'),
    validTo: new Date('2026-12-31'),
  });

  assert.equal(createdRows[0].supplierId, null);
});

test('vehicle rates accept optional supplierId on create', async () => {
  const { prisma, createdRows } = createVehicleRatesPrismaMock();
  const service = new VehicleRatesService(prisma as any);

  await service.create({
    vehicleId: 'vehicle-1',
    serviceTypeId: 'service-type-1',
    supplierId: 'supplier-1',
    routeName: 'Amman - Petra',
    minPax: 1,
    maxPax: 45,
    price: 100,
    currency: 'usd',
    validFrom: new Date('2026-04-01'),
    validTo: new Date('2026-12-31'),
  });

  assert.equal(createdRows[0].supplierId, 'supplier-1');
});

test('duplicating a vehicle rate preserves the grouped supplier card context and row notes', async () => {
  const { prisma, createdRows, existingRates } = createVehicleRatesPrismaMock();
  const service = new VehicleRatesService(prisma as any);

  existingRates.push({
    id: 'rate-source',
    vehicleId: 'vehicle-1',
    serviceTypeId: 'service-type-1',
    supplierId: 'supplier-1',
    routeId: 'route-amman-petra',
    fromPlaceId: null,
    toPlaceId: null,
    routeName: 'Amman -> Petra',
    minPax: 1,
    maxPax: 3,
    price: 100,
    currency: 'USD',
    notes: 'Supplier row note',
    active: true,
    validFrom: new Date('2026-04-01'),
    validTo: new Date('2026-12-31'),
    _count: { quoteItems: 0 },
  });

  await service.duplicate('rate-source');

  assert.equal(createdRows.length, 1);
  assert.equal(createdRows[0].supplierId, 'supplier-1');
  assert.equal(createdRows[0].routeId, 'route-amman-petra');
  assert.equal(createdRows[0].vehicleId, 'vehicle-1');
  assert.equal(createdRows[0].currency, 'USD');
  assert.equal(createdRows[0].notes, 'Supplier row note');
  assert.equal(createdRows[0].validFrom.toISOString().slice(0, 10), '2026-04-01');
  assert.equal(createdRows[0].validTo.toISOString().slice(0, 10), '2026-12-31');
});

test('transport pricing rules accept optional supplierId without changing pricing fields', async () => {
  const createdRows: any[] = [];
  const service = new TransportPricingService({
    transportPricingRule: {
      create: async ({ data }: any) => {
        createdRows.push(data);
        return { id: 'rule-1', ...data };
      },
    },
  } as any);

  await service.createRule({
    routeId: 'route-1',
    transportServiceTypeId: 'service-type-1',
    vehicleId: 'vehicle-1',
    supplierId: 'supplier-1',
    pricingMode: 'per_vehicle',
    minPax: 1,
    maxPax: 45,
    baseCost: 200,
    currency: 'usd',
  });

  assert.equal(createdRows[0].supplierId, 'supplier-1');
  assert.equal(createdRows[0].currency, 'USD');
  assert.equal(createdRows[0].discountPercent, 0);
  assert.equal(createdRows[0].isActive, true);
});
