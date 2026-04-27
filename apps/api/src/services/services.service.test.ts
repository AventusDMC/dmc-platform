import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ROLES_KEY } from '../auth/auth.decorators';
import { BadRequestException } from '@nestjs/common';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

function createServicesService(overrides?: Partial<any>) {
  const prisma = {
    supplierService: {
      findUnique: async () => ({ id: 'service-1' }),
    },
    serviceRate: {
      create: async ({ data }: any) => ({ id: 'rate-1', ...data }),
      findUnique: async ({ where }: any) => (where.id === 'missing-rate' ? null : { id: where.id, serviceId: 'service-1' }),
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      delete: async ({ where }: any) => ({ id: where.id }),
    },
    ...overrides,
  };

  return {
    service: new ServicesService(prisma as any),
    prisma,
  };
}

test('createRate persists a structured service rate', async () => {
  const { service } = createServicesService();

  const result = await service.createRate('service-1', {
    supplierId: 'supplier-1',
    costBaseAmount: 120,
    costCurrency: 'USD',
    pricingMode: 'PER_GROUP',
    salesTaxPercent: 16,
    salesTaxIncluded: false,
    serviceChargePercent: 10,
    serviceChargeIncluded: true,
    tourismFeeAmount: 5,
    tourismFeeCurrency: 'JOD',
    tourismFeeMode: 'PER_NIGHT_PER_ROOM',
  });

  assert.equal(result.serviceId, 'service-1');
  assert.equal(result.costCurrency, 'USD');
  assert.equal(result.pricingMode, 'PER_GROUP');
  assert.equal(result.tourismFeeCurrency, 'JOD');
});

test('DMC admin can create an activity for a supplier company different from actor and client companies', async () => {
  let createdData: any;
  const { service } = createServicesService({
    supplierService: {
      create: async ({ data }: any) => {
        createdData = data;
        return {
          id: 'activity-1',
          ...data,
          serviceType: null,
        };
      },
    },
  });

  const activity = await service.create({
    supplierId: 'supplier-company-1',
    name: 'Petra by Night',
    category: 'Activity',
    unitType: 'per_person',
    baseCost: 40,
    currency: 'USD',
    costBaseAmount: 35,
    costCurrency: 'USD',
  });

  assert.equal(activity.id, 'activity-1');
  assert.equal(activity.supplierId, 'supplier-company-1');
  assert.equal(activity.category, 'Activity');
  assert.equal(createdData.supplierId, 'supplier-company-1');
  assert.equal(createdData.supplierId === 'dmc-company-1', false);
  assert.equal(createdData.supplierId === 'client-company-1', false);
});

test('activity catalog list and detail are not filtered by actor company', async () => {
  let findManyArgs: any;
  let findUniqueArgs: any;
  const { service } = createServicesService({
    supplierService: {
      findMany: async (args: any) => {
        findManyArgs = args;
        return [
          {
            id: 'activity-1',
            supplierId: 'supplier-company-1',
            name: 'Petra by Night',
            category: 'Activity',
            serviceTypeId: null,
            serviceType: null,
            serviceRates: [],
          },
        ];
      },
      findUnique: async (args: any) => {
        findUniqueArgs = args;
        return {
          id: 'activity-1',
          supplierId: 'supplier-company-1',
          name: 'Petra by Night',
          category: 'Activity',
          serviceTypeId: null,
          serviceType: null,
          serviceRates: [],
          _count: { quoteItems: 0 },
        };
      },
    },
  });

  const activities = await service.findAll();
  const activity = await service.findOne('activity-1');

  assert.equal(activities[0].supplierId, 'supplier-company-1');
  assert.equal(activity.id, 'activity-1');
  assert.equal(findManyArgs.where, undefined);
  assert.deepEqual(findUniqueArgs.where, { id: 'activity-1' });
});

test('activity catalog write routes still require admin or operations roles', () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ServicesController.prototype.create), ['admin', 'operations']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ServicesController.prototype.update), ['admin', 'operations']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ServicesController.prototype.createRate), ['admin', 'operations']);
});

test('updateRate updates structured service rate fields', async () => {
  const { service } = createServicesService();

  const result = await service.updateRate('rate-1', {
    costBaseAmount: 180,
    costCurrency: 'EUR',
    pricingMode: 'PER_DAY',
    tourismFeeAmount: null,
    tourismFeeCurrency: null,
    tourismFeeMode: null,
  });

  assert.equal(result.id, 'rate-1');
  assert.equal(result.costBaseAmount, 180);
  assert.equal(result.costCurrency, 'EUR');
  assert.equal(result.pricingMode, 'PER_DAY');
  assert.equal(result.tourismFeeAmount, null);
});

test('removeRate deletes an existing service rate', async () => {
  const { service } = createServicesService();
  const result = await service.removeRate('rate-1');

  assert.deepEqual(result, { id: 'rate-1' });
});

test('service rate currency validation rejects unsupported codes', async () => {
  const { service } = createServicesService();

  await assert.rejects(
    () =>
      service.createRate('service-1', {
        costBaseAmount: 100,
        costCurrency: 'usd',
        pricingMode: 'PER_PERSON',
      }),
    (error: unknown) => error instanceof BadRequestException && /USD, EUR, or JOD/.test(error.message),
  );
});
