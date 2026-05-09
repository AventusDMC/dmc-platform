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
    $transaction: async (callback: any) => callback(prisma),
    ticketRateVariant: {
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      create: async ({ data }: any) => ({ id: 'ticket-variant-1', ...data }),
      updateMany: async () => ({ count: 0 }),
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
    maxPaxPerUnit: 44,
  });

  assert.equal(result.serviceId, 'service-1');
  assert.equal(result.costCurrency, 'USD');
  assert.equal(result.pricingMode, 'PER_GROUP');
  assert.equal(result.tourismFeeCurrency, 'JOD');
  assert.equal(result.maxPaxPerUnit, 44);
});

test('createRate API returns persisted maxPaxPerUnit', async () => {
  const { service } = createServicesService();
  const controller = new ServicesController(service);

  const result = await controller.createRate('service-1', {
    costBaseAmount: 120,
    costCurrency: 'USD',
    pricingMode: 'PER_GROUP',
    maxPaxPerUnit: 18,
  });

  assert.equal(result.maxPaxPerUnit, 18);
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

test('update service preserves ticket variants and deactivates removed variants', async () => {
  const variantActions: any[] = [];
  const { service } = createServicesService({
    ticketRateVariant: {
      findMany: async () => [{ id: 'variant-1' }, { id: 'variant-removed' }],
      update: async ({ where, data }: any) => {
        variantActions.push({ action: 'update', where, data });
        return { id: where.id, ...data };
      },
      create: async ({ data }: any) => {
        variantActions.push({ action: 'create', data });
        return { id: 'variant-new', ...data };
      },
      updateMany: async ({ where, data }: any) => {
        variantActions.push({ action: 'updateMany', where, data });
        return { count: 1 };
      },
    },
    supplierService: {
      findUnique: async () => ({
        id: 'service-1',
        supplierId: 'supplier-1',
        name: 'Petra Entrance Ticket',
        category: 'ticketing',
        serviceTypeId: 'type-ticket',
        serviceType: { id: 'type-ticket', name: 'Entrance Ticket', code: 'ENTRANCE_TICKET', isActive: true },
        unitType: 'per_person',
        baseCost: 50,
        currency: 'JOD',
        costBaseAmount: 50,
        costCurrency: 'JOD',
        serviceRates: [],
        ticketRateVariants: [],
        _count: { quoteItems: 0 },
      }),
      update: async ({ where, data, include }: any) => ({ id: where.id, ...data, serviceType: null, ticketRateVariants: include.ticketRateVariants ? [] : undefined }),
    },
  });

  await service.update('service-1', {
    ticketRateVariants: [
      {
        id: 'variant-1',
        label: '2 Days',
        costPrice: 55,
        sellPrice: null,
        currency: 'JOD',
        pricingBasis: 'PER_PERSON',
        includedInJordanPass: true,
        active: true,
      },
      {
        label: 'Same-Day Visitor',
        costPrice: 90,
        currency: 'JOD',
        pricingBasis: 'PER_PERSON',
        includedInJordanPass: false,
        active: true,
      },
    ],
  });

  assert.equal(variantActions[0].action, 'update');
  assert.deepEqual(variantActions[0].where, { id: 'variant-1' });
  assert.equal(variantActions[0].data.label, '2 Days');
  assert.equal(variantActions[0].data.includedInJordanPass, true);
  assert.equal(variantActions[0].data.sortOrder, 0);
  assert.equal(variantActions[1].action, 'create');
  assert.equal(variantActions[1].data.label, 'Same-Day Visitor');
  assert.equal(variantActions[1].data.serviceId, 'service-1');
  assert.equal(variantActions[1].data.includedInJordanPass, false);
  assert.deepEqual(variantActions[2], {
    action: 'updateMany',
    where: { id: { in: ['variant-removed'] } },
    data: { active: false },
  });
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
    maxPaxPerUnit: 24,
  });

  assert.equal(result.id, 'rate-1');
  assert.equal(result.costBaseAmount, 180);
  assert.equal(result.costCurrency, 'EUR');
  assert.equal(result.pricingMode, 'PER_DAY');
  assert.equal(result.tourismFeeAmount, null);
  assert.equal(result.maxPaxPerUnit, 24);
});

test('updateRate clears maxPaxPerUnit when null is submitted', async () => {
  const { service } = createServicesService();

  const result = await service.updateRate('rate-1', {
    maxPaxPerUnit: null,
  });

  assert.equal(result.id, 'rate-1');
  assert.equal(result.maxPaxPerUnit, null);
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
    (error: unknown) => error instanceof BadRequestException && /USD, EUR, JOD, or ILS/.test(error.message),
  );
});
