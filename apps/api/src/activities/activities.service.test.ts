import { BadRequestException } from '@nestjs/common';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROLES_KEY } from '../auth/auth.decorators';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

function createActivitiesService(overrides: Partial<any> = {}) {
  const prisma = {
    company: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async ({ where }: any) => (where?.id?.in || []).map((id: string) => ({ id })),
      findFirst: async () => ({ id: 'supplier-company-1', name: 'Petra Experiences' }),
      create: async ({ data }: any) => ({ id: 'supplier-company-1', ...data }),
    },
    $transaction: async (callback: any) => callback(prisma),
    activityRateVariant: {
      deleteMany: async () => ({ count: 0 }),
      findMany: async () => [],
      update: async ({ data }: any) => ({ id: 'variant-1', ...data }),
      create: async ({ data }: any) => ({ id: 'variant-2', ...data }),
      updateMany: async () => ({ count: 0 }),
    },
    activity: {
      create: async ({ data, include }: any) => ({
        id: 'activity-1',
        ...data,
        supplierCompany: include?.supplierCompany ? { id: data.supplierCompanyId, name: 'Petra Experiences' } : undefined,
      }),
      findMany: async (args: any) => [
        {
          id: 'activity-1',
          name: 'Petra by Night',
          supplierCompanyId: 'supplier-company-1',
          pricingBasis: 'PER_PERSON',
          costPrice: 35,
          sellPrice: 55,
          active: true,
          rateVariants: args.include?.rateVariants ? [] : undefined,
          supplierCompany: args.include?.supplierCompany ? { id: 'supplier-company-1', name: 'Petra Experiences' } : undefined,
        },
      ],
      findUnique: async ({ where, include }: any) =>
        where.id === 'missing'
          ? null
          : {
              id: where.id,
              name: 'Petra by Night',
              supplierCompanyId: 'supplier-company-1',
              pricingBasis: 'PER_PERSON',
              costPrice: 35,
              sellPrice: 55,
              active: true,
              rateVariants: include?.rateVariants ? [] : undefined,
              supplierCompany: include?.supplierCompany ? { id: 'supplier-company-1', name: 'Petra Experiences' } : undefined,
            },
      update: async ({ where, data, include }: any) => ({
        id: where.id,
        ...data,
        supplierCompany: include?.supplierCompany ? { id: data.supplierCompanyId ?? 'supplier-company-1', name: 'Petra Experiences' } : undefined,
      }),
    },
    ...overrides,
  };

  return {
    service: new ActivitiesService(prisma as any),
    prisma,
  };
}

test('create activity persists supplier company pricing and active state', async () => {
  let createdData: any;
  const { service } = createActivitiesService({
    activity: {
      create: async ({ data }: any) => {
        createdData = data;
        return { id: 'activity-1', ...data };
      },
    },
  });

  const activity = await service.create({
    name: ' Petra by Night ',
    description: ' Evening visit ',
    supplierCompanyId: 'supplier-company-1',
    pricingBasis: 'PER_PERSON',
    costPrice: 35,
    sellPrice: 55,
    durationMinutes: 120,
  });

  assert.equal(activity.id, 'activity-1');
  assert.equal(createdData.name, 'Petra by Night');
  assert.equal(createdData.description, 'Evening visit');
  assert.equal(createdData.supplierCompanyId, 'supplier-company-1');
  assert.equal(createdData.pricingBasis, 'PER_PERSON');
  assert.equal(createdData.costPrice, 35);
  assert.equal(createdData.sellPrice, 55);
  assert.equal(createdData.durationMinutes, 120);
  assert.equal(createdData.active, true);
});

test('create activity persists multiple structured rate variants', async () => {
  let createdData: any;
  const { service } = createActivitiesService({
    activity: {
      create: async ({ data }: any) => {
        createdData = data;
        return { id: 'activity-1', ...data };
      },
    },
  });

  await service.create({
    name: 'Wadi Rum Jeep Tour',
    supplierCompanyId: 'supplier-company-1',
    pricingBasis: 'PER_GROUP',
    costPrice: 90,
    sellPrice: 120,
    durationMinutes: 120,
    rateVariants: [
      {
        name: '2 Hours',
        durationMinutes: 120,
        currency: 'JOD',
        pricingBasis: 'PER_GROUP',
        supplierCompanyId: 'supplier-company-1',
        costPrice: 90,
        sellPrice: 120,
        minPax: 1,
        maxPax: 6,
        maxPaxPerUnit: 6,
        capacityPricing: true,
        active: true,
        guideRequired: true,
        meetingPoint: 'Wadi Rum Visitor Center',
        operationalNotes: 'Supplier confirms jeep capacity before arrival.',
      },
      {
        name: 'Full Day',
        durationMinutes: 480,
        currency: 'USD',
        pricingBasis: 'PER_GROUP',
        costPrice: 260,
        sellPrice: 340,
        maxPaxPerUnit: 6,
        notes: 'Lunch stop not included',
      },
    ],
  });

  assert.equal(createdData.rateVariants.create.length, 2);
  assert.deepEqual(createdData.rateVariants.create[0], {
    name: '2 Hours',
    durationMinutes: 120,
    pricingBasis: 'PER_GROUP',
    supplierCompanyId: 'supplier-company-1',
    currency: 'JOD',
    costPrice: 90,
    sellPrice: 120,
    minPax: 1,
    maxPax: 6,
    maxPaxPerUnit: 6,
    capacityPricing: true,
    active: true,
    notes: undefined,
    guideRequired: true,
    meetingPoint: 'Wadi Rum Visitor Center',
    operationalNotes: 'Supplier confirms jeep capacity before arrival.',
    sortOrder: 0,
  });
  assert.equal(createdData.rateVariants.create[1].name, 'Full Day');
  assert.equal(createdData.rateVariants.create[1].currency, 'USD');
  assert.equal(createdData.rateVariants.create[1].sortOrder, 1);
});

test('update activity variants preserves existing variant ids and deactivates removed variants', async () => {
  const variantActions: any[] = [];
  const { service } = createActivitiesService({
    activityRateVariant: {
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
    activity: {
      findUnique: async ({ where, include }: any) => ({
        id: where.id,
        name: 'Wadi Rum Jeep Tour',
        supplierCompanyId: 'supplier-company-1',
        rateVariants: include?.rateVariants ? [] : undefined,
      }),
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
  });

  await service.update('activity-1', {
    rateVariants: [
      {
        id: 'variant-1',
        name: '2 Hours VIP',
        durationMinutes: 120,
        pricingBasis: 'PER_GROUP',
        currency: 'ILS',
        costPrice: 140,
        sellPrice: 190,
        maxPaxPerUnit: 6,
        active: true,
      },
      {
        name: 'Shared Jeep',
        durationMinutes: 180,
        pricingBasis: 'PER_PERSON',
        currency: 'JOD',
        costPrice: 20,
        sellPrice: 35,
        active: true,
      },
    ],
  });

  assert.deepEqual(variantActions[0], {
    action: 'update',
    where: { id: 'variant-1' },
    data: {
      name: '2 Hours VIP',
      durationMinutes: 120,
      pricingBasis: 'PER_GROUP',
      currency: 'ILS',
      costPrice: 140,
      sellPrice: 190,
      maxPaxPerUnit: 6,
      active: true,
      notes: undefined,
      sortOrder: 0,
    },
  });
  assert.equal(variantActions[1].action, 'create');
  assert.equal(variantActions[1].data.activityId, 'activity-1');
  assert.equal(variantActions[1].data.sortOrder, 1);
  assert.deepEqual(variantActions[2], {
    action: 'updateMany',
    where: { id: { in: ['variant-removed'] } },
    data: { active: false },
  });
});

test('duplicate activity clones variants into inactive review copy', async () => {
  let createdData: any;
  const { service } = createActivitiesService({
    activity: {
      findUnique: async ({ where, include }: any) => ({
        id: where.id,
        name: 'Wadi Rum Jeep Tour',
        description: 'Desert jeep options',
        supplierCompanyId: 'supplier-company-1',
        pricingBasis: 'PER_GROUP',
        costPrice: 90,
        sellPrice: 120,
        durationMinutes: 120,
        active: true,
        rateVariants: include?.rateVariants
          ? [
              {
                id: 'variant-1',
                name: '2 Hours',
                durationMinutes: 120,
                currency: 'EUR',
                pricingBasis: 'PER_GROUP',
                costPrice: 90,
                sellPrice: 120,
                maxPaxPerUnit: 6,
                active: true,
                notes: 'Private jeep',
              },
            ]
          : undefined,
      }),
      create: async ({ data }: any) => {
        createdData = data;
        return { id: 'activity-copy', ...data };
      },
    },
  });

  const copy = await service.duplicate('activity-1');

  assert.equal(copy.id, 'activity-copy');
  assert.equal(createdData.name, 'Wadi Rum Jeep Tour Copy');
  assert.equal(createdData.active, false);
  assert.equal(createdData.rateVariants.create.length, 1);
  assert.equal(createdData.rateVariants.create[0].name, '2 Hours');
  assert.equal(createdData.rateVariants.create[0].currency, 'EUR');
  assert.equal(createdData.rateVariants.create[0].maxPaxPerUnit, 6);
});

test('create and update activity ignore unsupported UI-only fields', async () => {
  let createdData: any;
  let updateData: any;
  const { service } = createActivitiesService({
    activity: {
      create: async ({ data }: any) => {
        createdData = data;
        return { id: 'activity-1', ...data };
      },
      findUnique: async ({ where }: any) => ({ id: where.id }),
      update: async ({ data }: any) => {
        updateData = data;
        return { id: 'activity-1', ...data };
      },
    },
  });

  await service.create({
    name: 'Petra by Night',
    description: 'Evening visit',
    supplierCompanyId: 'supplier-company-1',
    pricingBasis: 'PER_PERSON',
    costPrice: 35,
    sellPrice: 55,
    durationMinutes: 120,
    country: 'Jordan',
    city: 'Petra',
    currency: 'JOD',
    defaultStartTime: '20:30',
    operationNotes: 'Meet at visitor center',
  } as any);
  await service.update('activity-1', {
    sellPrice: 60,
    country: 'Jordan',
    city: 'Petra',
    currency: 'JOD',
    defaultStartTime: '20:30',
    operationNotes: 'Meet at visitor center',
  } as any);

  assert.equal(createdData.city, 'Petra');
  for (const data of [createdData, updateData]) {
    assert.equal(data.country, undefined);
    assert.equal(data.currency, undefined);
    assert.equal(data.defaultStartTime, undefined);
    assert.equal(data.operationNotes, undefined);
  }
});

test('ensure Petra Hiking Experiences creates one Activity Master with trail variants and guide metadata', async () => {
  let createdData: any;
  const { service } = createActivitiesService({
    activity: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        createdData = data;
        return { id: 'activity-hiking', ...data, rateVariants: data.rateVariants.create };
      },
    },
  });

  const activity = await service.ensurePetraHikingExperiences();

  assert.equal(activity.id, 'activity-hiking');
  assert.equal(createdData.code, 'PETRA_HIKING_EXPERIENCES');
  assert.equal(createdData.name, 'Petra Hiking Experiences');
  assert.equal(createdData.category, 'Hiking / Adventure / Historical');
  assert.equal(createdData.city, 'Petra');
  assert.equal(createdData.region, 'South Jordan');
  assert.equal(createdData.pricingBasis, 'PER_GROUP');
  assert.equal(createdData.active, true);
  assert.equal(createdData.rateVariants.create.length, 7);
  assert.deepEqual(
    createdData.rateVariants.create.map((variant: any) => variant.name),
    [
      'Monastery Trail',
      'Back Trail',
      'High Place of Sacrifice Trail',
      'Treasury Viewpoint Trail',
      'Little Petra to Monastery Trail',
      'Al Kubtha Trail',
      'Jabal Haroun Trail',
    ],
  );
  assert.equal(createdData.rateVariants.create[0].guideRequirement, 'BOTH_ACCEPTED');
  assert.equal(createdData.rateVariants.create[1].guideRequirement, 'LOCAL_GUIDE_REQUIRED');
  assert.equal(createdData.rateVariants.create[6].guideRequired, true);
  assert.equal(createdData.rateVariants.create[6].pricingBasis, 'PER_GROUP');
  assert.match(createdData.rateVariants.create[6].waterNotes, /drinking water/i);
});

test('ensure Petra Hiking Experiences updates existing master and keeps variants linked without duplicates', async () => {
  let createCalls = 0;
  let updateCalls = 0;
  const variantActions: any[] = [];
  const { service } = createActivitiesService({
    activity: {
      findFirst: async () => ({ id: 'activity-existing', name: 'Petra Hiking Experiences' }),
      create: async () => {
        createCalls += 1;
        return { id: 'new-activity' };
      },
      update: async ({ where, data }: any) => {
        updateCalls += 1;
        return { id: where.id, ...data };
      },
    },
    activityRateVariant: {
      findMany: async () => [{ id: 'variant-monastery', name: 'Monastery Trail' }],
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
        return { count: 0 };
      },
    },
  });

  await service.ensurePetraHikingExperiences();

  assert.equal(createCalls, 0);
  assert.equal(updateCalls, 1);
  assert.equal(variantActions[0].action, 'update');
  assert.equal(variantActions[0].where.id, 'variant-monastery');
  assert.equal(variantActions[1].action, 'create');
  assert.equal(variantActions[1].data.activityId, 'activity-existing');
  assert.equal(variantActions.filter((action) => action.action === 'create').length, 6);
});

test('list and detail activities are not filtered by actor company', async () => {
  let findManyArgs: any;
  let findUniqueArgs: any;
  const { service } = createActivitiesService({
    activity: {
      findMany: async (args: any) => {
        findManyArgs = args;
        return [{ id: 'activity-1', supplierCompanyId: 'supplier-company-1' }];
      },
      findUnique: async (args: any) => {
        findUniqueArgs = args;
        return { id: args.where.id, supplierCompanyId: 'supplier-company-1' };
      },
    },
  });

  const activities = await service.findAll();
  const activity = await service.findOne('activity-1');

  assert.equal(activities[0].supplierCompanyId, 'supplier-company-1');
  assert.equal(activity.id, 'activity-1');
  assert.equal(findManyArgs.where, undefined);
  assert.deepEqual(findUniqueArgs.where, { id: 'activity-1' });
});

test('update activity validates pricing basis and supplier company without actor-company forcing', async () => {
  let companyLookupWhere: any;
  let updateData: any;
  const { service } = createActivitiesService({
    company: {
      findUnique: async ({ where }: any) => {
        companyLookupWhere = where;
        return { id: where.id };
      },
    },
    activity: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      update: async ({ data }: any) => {
        updateData = data;
        return { id: 'activity-1', ...data };
      },
    },
  });

  await service.update('activity-1', {
    supplierCompanyId: 'supplier-company-2',
    pricingBasis: 'PER_GROUP',
    active: false,
  });

  assert.deepEqual(companyLookupWhere, { id: 'supplier-company-2' });
  assert.equal(updateData.supplierCompanyId, 'supplier-company-2');
  assert.equal(updateData.pricingBasis, 'PER_GROUP');
  assert.equal(updateData.active, false);
});

test('activity validation rejects unsupported pricing basis and missing supplier company', async () => {
  const { service } = createActivitiesService({
    company: {
      findUnique: async () => null,
    },
  });

  await assert.rejects(
    () =>
      service.create({
        name: 'Bad activity',
        supplierCompanyId: 'missing-company',
        pricingBasis: 'PER_PERSON',
        costPrice: 10,
        sellPrice: 15,
      }),
    (error: unknown) => error instanceof BadRequestException && /Supplier company not found/.test(error.message),
  );

  const validSupplier = createActivitiesService().service;
  await assert.rejects(
    () =>
      validSupplier.create({
        name: 'Bad activity',
        supplierCompanyId: 'supplier-company-1',
        pricingBasis: 'PER_DAY' as any,
        costPrice: 10,
        sellPrice: 15,
      }),
    (error: unknown) => error instanceof BadRequestException && /PER_PERSON or PER_GROUP/.test(error.message),
  );
});

test('activities write routes remain protected for admin and operations users', () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ActivitiesController.prototype.create), ['admin', 'operations']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ActivitiesController.prototype.update), ['admin', 'operations']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ActivitiesController.prototype.duplicate), ['admin', 'operations']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ActivitiesController.prototype.ensurePetraHikingExperiences), ['admin', 'operations']);
});
