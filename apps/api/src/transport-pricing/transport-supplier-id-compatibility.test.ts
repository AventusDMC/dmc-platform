import test = require('node:test');
import assert = require('node:assert/strict');
import { VehicleRatesService } from '../vehicle-rates/vehicle-rates.service';
import { TransportPricingService } from './transport-pricing.service';

function createVehicleRatesPrismaMock() {
  const createdRows: any[] = [];

  return {
    createdRows,
    prisma: {
      vehicle: {
        findUnique: async () => ({ id: 'vehicle-1', name: 'Bus 45', maxPax: 45 }),
      },
      transportServiceType: {
        findUnique: async () => ({ id: 'service-type-1', name: 'Full Day', code: 'FULL_DAY' }),
      },
      vehicleRate: {
        create: async ({ data }: any) => {
          createdRows.push(data);
          return { id: `rate-${createdRows.length}`, ...data };
        },
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
