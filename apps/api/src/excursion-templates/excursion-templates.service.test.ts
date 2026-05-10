const assert = require('node:assert/strict');
const test = require('node:test');
const { BadRequestException } = require('@nestjs/common');
const { ROLES_KEY } = require('../auth/auth.decorators');
const { ExcursionTemplatesController } = require('./excursion-templates.controller');
const { ExcursionTemplatesService } = require('./excursion-templates.service');

function createExcursionTemplatesService(overrides: Partial<any> = {}) {
  const prisma = {
    $transaction: async (callback: any) => callback(prisma),
    excursionTemplate: {
      create: async ({ data, include }: any) => ({ id: 'template-1', ...data, include }),
      findUnique: async ({ where }: any) => ({
        id: where.id ?? 'template-1',
        code: where.code ?? 'PETRA_FULL_DAY',
        components: [],
      }),
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
    excursionTemplateComponent: {
      deleteMany: async () => ({ count: 0 }),
    },
    supplierService: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [],
    },
    activity: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [],
    },
    route: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [],
    },
    transportServiceType: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [],
    },
    transportPricingRule: {
      findMany: async () => [],
    },
    ...overrides,
  };

  return {
    prisma,
    service: new ExcursionTemplatesService(prisma as any),
  };
}

test('create excursion template persists ordered operational components without duplicating catalog records', async () => {
  let createdData: any;
  const { service } = createExcursionTemplatesService({
    excursionTemplate: {
      create: async ({ data }: any) => {
        createdData = data;
        return { id: 'template-1', ...data };
      },
    },
  });

  await service.create({
    name: 'Petra Full Day Operational Excursion',
    code: 'PETRA_FULL_DAY',
    defaultDepartureCity: 'Amman',
    durationMinutes: 720,
    operationalNotes: 'Reusable operations template',
    components: [
      {
        componentType: 'TRANSPORT',
        label: 'Round-trip transport',
        routeId: 'route-amman-petra',
        transportServiceTypeId: 'service-full-day',
      },
      {
        componentType: 'TICKET',
        label: 'Petra entrance ticket',
        supplierServiceId: 'service-petra-ticket',
      },
      {
        componentType: 'ACTIVITY',
        label: 'Petra guided experience',
        activityId: 'activity-petra-guide',
      },
      {
        componentType: 'DINING',
        label: 'Lunch in Petra area',
        supplierServiceId: 'service-petra-lunch',
        isOptional: true,
      },
    ],
  });

  assert.equal(createdData.name, 'Petra Full Day Operational Excursion');
  assert.equal(createdData.defaultDepartureCity, 'Amman');
  assert.equal(createdData.durationMinutes, 720);
  assert.deepEqual(
    createdData.components.create.map((component: any) => component.componentType),
    ['TRANSPORT', 'TICKET', 'ACTIVITY', 'DINING'],
  );
  assert.equal(createdData.components.create[0].routeId, 'route-amman-petra');
  assert.equal(createdData.components.create[0].transportServiceTypeId, 'service-full-day');
  assert.equal(createdData.components.create[1].supplierServiceId, 'service-petra-ticket');
  assert.equal(createdData.components.create[2].activityId, 'activity-petra-guide');
  assert.equal(createdData.components.create[3].isOptional, true);
});

test('component validation prevents leaking transport and activity references into the wrong component type', async () => {
  const { service } = createExcursionTemplatesService();

  await assert.rejects(
    () =>
      service.create({
        name: 'Bad template',
        components: [{ componentType: 'TICKET', label: 'Wrong activity link', activityId: 'activity-1' }],
      }),
    (error: unknown) => error instanceof BadRequestException && /activityId is only allowed/.test((error as Error).message),
  );

  await assert.rejects(
    () =>
      service.create({
        name: 'Bad template',
        components: [{ componentType: 'DINING', label: 'Wrong route link', routeId: 'route-1' }],
      }),
    (error: unknown) => error instanceof BadRequestException && /transport references are only allowed/.test((error as Error).message),
  );
});

test('suggested transport resolves candidate rates through existing transport pricing rules', async () => {
  let ruleLookup: any;
  const { service } = createExcursionTemplatesService({
    excursionTemplate: {
      findUnique: async () => ({
        id: 'template-1',
        components: [
          {
            id: 'component-transport',
            componentType: 'TRANSPORT',
            label: 'Round-trip transport',
            routeId: 'route-amman-petra',
            transportServiceTypeId: 'service-full-day',
          },
        ],
      }),
    },
    transportPricingRule: {
      findMany: async (args: any) => {
        ruleLookup = args;
        return [{ id: 'rule-1', baseCost: 250 }];
      },
    },
  });

  const result = await service.getSuggestedTransport('template-1', 21);

  assert.deepEqual(ruleLookup.where, {
    routeId: 'route-amman-petra',
    transportServiceTypeId: 'service-full-day',
    isActive: true,
    minPax: { lte: 21 },
    maxPax: { gte: 21 },
  });
  assert.equal(result.suggestions[0].candidates[0].id, 'rule-1');
});

test('Petra Full Day seed template is composite and links existing modules when found', async () => {
  let createdData: any;
  const services = [
    { id: 'service-ticket', name: 'Petra Entrance Ticket' },
    { id: 'service-guide', name: 'Petra Full Day Guide' },
    { id: 'service-lunch', name: 'Petra Lunch Restaurant' },
  ];
  const { service } = createExcursionTemplatesService({
    excursionTemplate: {
      findUnique: async () => null,
      create: async ({ data }: any) => {
        createdData = data;
        return { id: 'template-1', ...data };
      },
    },
    supplierService: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => services,
    },
    activity: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'activity-petra-guided', name: 'Petra Guided Experience' }],
    },
    route: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'route-amman-petra', name: 'Amman to Petra', durationMinutes: 360 }],
    },
    transportServiceType: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'service-full-day', name: 'Full Day', classification: 'FULL_DAY' }],
    },
  });

  await service.ensurePetraFullDayTemplate();

  assert.equal(createdData.code, 'PETRA_FULL_DAY');
  assert.equal(createdData.defaultDepartureCity, 'Amman');
  assert.deepEqual(
    createdData.components.create.map((component: any) => component.componentType),
    ['TRANSPORT', 'TICKET', 'ACTIVITY', 'DINING'],
  );
  assert.equal(createdData.components.create[0].routeId, 'route-amman-petra');
  assert.equal(createdData.components.create[0].transportServiceTypeId, 'service-full-day');
  assert.equal(createdData.components.create[1].supplierServiceId, 'service-ticket');
  assert.equal(createdData.components.create[2].activityId, 'activity-petra-guided');
  assert.equal(createdData.components.create[3].supplierServiceId, 'service-lunch');
  assert.equal(createdData.components.create[3].isOptional, true);
});

test('Jerash and Amman seed template preserves component order and placeholder notes', async () => {
  let createdData: any;
  const services = [
    { id: 'service-jerash-ticket', name: 'Jerash Entrance Ticket' },
    { id: 'service-amman-ticket', name: 'Amman Citadel Roman Theatre Entrance Ticket' },
    { id: 'service-lunch', name: 'Amman Lunch Restaurant' },
  ];
  const { service } = createExcursionTemplatesService({
    excursionTemplate: {
      findUnique: async () => null,
      create: async ({ data }: any) => {
        createdData = data;
        return { id: 'template-jerash-amman', ...data };
      },
    },
    supplierService: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => services,
    },
    activity: {
      findMany: async () => [],
    },
    route: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'route-amman-jerash', name: 'Amman to Jerash to Amman', durationMinutes: 180 }],
    },
    transportServiceType: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'service-full-day', name: 'Full Day', classification: 'FULL_DAY' }],
    },
  });

  await service.ensureJerashAmmanFullDayTemplate();

  assert.equal(createdData.code, 'JERASH_AMMAN_FULL_DAY');
  assert.equal(createdData.defaultDepartureCity, 'Amman');
  assert.equal(createdData.durationMinutes, 480);
  assert.deepEqual(
    createdData.components.create.map((component: any) => component.componentType),
    ['TRANSPORT', 'TICKET', 'GUIDE', 'TICKET', 'DINING'],
  );
  assert.equal(createdData.components.create[0].routeId, 'route-amman-jerash');
  assert.equal(createdData.components.create[1].supplierServiceId, 'service-jerash-ticket');
  assert.equal(createdData.components.create[2].label, 'Jerash local guide / Amman city interpretation');
  assert.match(createdData.components.create[2].operationalNotes, /Placeholder component/);
  assert.equal(createdData.components.create[3].supplierServiceId, 'service-amman-ticket');
  assert.equal(createdData.components.create[4].isOptional, true);
});

test('Dead Sea Escape seed template preserves component order and optional components', async () => {
  let createdData: any;
  const { service } = createExcursionTemplatesService({
    excursionTemplate: {
      findUnique: async () => null,
      create: async ({ data }: any) => {
        createdData = data;
        return { id: 'template-dead-sea', ...data };
      },
    },
    supplierService: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'service-day-access', name: 'Dead Sea Resort Day Access' }],
    },
    activity: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'activity-spa', name: 'Dead Sea Mud Spa Experience' }],
    },
    route: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'route-amman-dead-sea', name: 'Amman to Dead Sea to Amman', durationMinutes: 120 }],
    },
    transportServiceType: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'service-full-day', name: 'Full Day', classification: 'FULL_DAY' }],
    },
  });

  await service.ensureDeadSeaEscapeTemplate();

  assert.equal(createdData.code, 'DEAD_SEA_ESCAPE');
  assert.equal(createdData.durationMinutes, 480);
  assert.deepEqual(
    createdData.components.create.map((component: any) => component.componentType),
    ['TRANSPORT', 'DINING', 'ACTIVITY', 'DINING'],
  );
  assert.equal(createdData.components.create[0].routeId, 'route-amman-dead-sea');
  assert.equal(createdData.components.create[1].supplierServiceId, 'service-day-access');
  assert.equal(createdData.components.create[2].activityId, 'activity-spa');
  assert.equal(createdData.components.create[2].isOptional, true);
  assert.equal(createdData.components.create[3].isOptional, true);
});

test('ensure endpoints update existing templates by code instead of creating duplicates', async () => {
  let createCalls = 0;
  let updateCalls = 0;
  let deletedComponentsFor: string | undefined;
  const { service } = createExcursionTemplatesService({
    excursionTemplate: {
      findUnique: async ({ where }: any) =>
        where.code === 'JERASH_AMMAN_FULL_DAY' || where.id === 'template-existing'
          ? { id: 'template-existing', code: 'JERASH_AMMAN_FULL_DAY', components: [] }
          : null,
      create: async () => {
        createCalls += 1;
        return { id: 'new-template' };
      },
      update: async ({ where, data }: any) => {
        updateCalls += 1;
        return { id: where.id, ...data };
      },
    },
    excursionTemplateComponent: {
      deleteMany: async ({ where }: any) => {
        deletedComponentsFor = where.templateId;
        return { count: 5 };
      },
    },
    supplierService: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [],
    },
  });

  await service.ensureJerashAmmanFullDayTemplate();

  assert.equal(createCalls, 0);
  assert.equal(updateCalls, 1);
  assert.equal(deletedComponentsFor, 'template-existing');
});

test('excursion template writes are restricted to admin and operations users', () => {
  assert.deepEqual((Reflect as any).getMetadata(ROLES_KEY, ExcursionTemplatesController.prototype.create), ['admin', 'operations']);
  assert.deepEqual((Reflect as any).getMetadata(ROLES_KEY, ExcursionTemplatesController.prototype.update), ['admin', 'operations']);
  assert.deepEqual((Reflect as any).getMetadata(ROLES_KEY, ExcursionTemplatesController.prototype.ensurePetraFullDayTemplate), [
    'admin',
    'operations',
  ]);
  assert.deepEqual((Reflect as any).getMetadata(ROLES_KEY, ExcursionTemplatesController.prototype.ensureJerashAmmanFullDayTemplate), [
    'admin',
    'operations',
  ]);
  assert.deepEqual((Reflect as any).getMetadata(ROLES_KEY, ExcursionTemplatesController.prototype.ensureDeadSeaEscapeTemplate), [
    'admin',
    'operations',
  ]);
});
