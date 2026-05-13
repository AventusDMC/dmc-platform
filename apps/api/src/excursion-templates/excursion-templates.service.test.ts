const assert = require('node:assert/strict');
const test = require('node:test');
const { BadRequestException } = require('@nestjs/common');
const { ROLES_KEY } = require('../auth/auth.decorators');
const { ExcursionTemplatesController } = require('./excursion-templates.controller');
const { ExcursionTemplatesService } = require('./excursion-templates.service');
const XLSX = require('xlsx');

function buildOperationalBlueprintWorkbook(overrides = {}) {
  const sheets = {
    EXCURSION_TEMPLATES: [
      {
        TemplateCode: 'PETRA_2D',
        TemplateName: 'Petra Two Day',
        DurationDays: 2,
        StartCity: 'Amman',
        Category: 'Cultural',
        Description: 'Operational Petra program',
        Active: 'Active',
      },
    ],
    TOURING_ROUTES: [
      {
        RouteCode: 'AMM_PETRA_2D',
        TemplateCode: 'PETRA_2D',
        RouteName: 'Amman Petra Two Day',
        StartCity: 'Amman',
        DurationDays: 2,
        RouteDescription: 'Amman to Petra touring route',
        MainDestinations: 'Petra; Little Petra',
        IncludedKM: 480,
        IncludedHours: 20,
      },
    ],
    TOURING_ROUTE_STOPS: [
      { RouteCode: 'AMM_PETRA_2D', StopOrder: 1, StopName: 'Petra Visitor Center', Region: 'Petra', Overnight: 'Yes', Notes: 'Main visit' },
    ],
    TRANSPORT_COMPONENTS: [{ TemplateCode: 'PETRA_2D', RouteCode: 'AMM_PETRA_2D', Required: 'Yes', PricingMode: 'Full Day', Notes: 'Touring vehicle' }],
    TICKET_COMPONENTS: [{ TemplateCode: 'PETRA_2D', TicketName: 'Petra Entrance Ticket', Required: 'Yes', Notes: 'Use Jordan Pass where applicable' }],
    GUIDE_COMPONENTS: [{ TemplateCode: 'PETRA_2D', GuideType: 'Petra Guide', Required: 'Yes', Notes: 'Local guide' }],
    DINING_COMPONENTS: [{ TemplateCode: 'PETRA_2D', DiningName: 'Lunch in Petra', Required: 'No', Optional: 'Yes', Notes: 'Optional lunch' }],
    ACTIVITY_COMPONENTS: [{ TemplateCode: 'PETRA_2D', ActivityName: 'Petra Guided Walk', Required: 'Yes', Optional: 'No', Notes: 'Activity master' }],
    OPTIONAL_COMPONENTS: [{ TemplateCode: 'PETRA_2D', ComponentType: 'ACTIVITY', ComponentName: 'Petra by Night', Notes: 'Optional if operating' }],
    ...overrides,
  };
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
  }
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
}

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
      create: async ({ data }: any) => ({ id: 'component-created', ...data }),
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      findFirst: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [],
    },
    supplierService: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [],
    },
    activity: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findFirst: async () => null,
      create: async ({ data }: any) => ({ id: 'activity-created', ...data, rateVariants: data.rateVariants?.create || [] }),
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      findMany: async () => [],
    },
    activityRateVariant: {
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      create: async ({ data }: any) => ({ id: 'variant-created', ...data }),
      updateMany: async () => ({ count: 0 }),
    },
    company: {
      findFirst: async () => ({ id: 'company-sindbad', name: 'Sindbad' }),
      create: async ({ data }: any) => ({ id: 'company-sindbad', ...data }),
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
    touringRoute: {
      findUnique: async () => null,
      create: async ({ data }: any) => ({ id: `touring-route-${data.code}`, ...data }),
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
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
    operatingDays: 'Daily',
    recommendedDepartureTime: '08:00',
    estimatedReturnTime: '20:00',
    minimumPax: 2,
    maximumPax: 24,
    weatherSensitive: true,
    childFriendly: true,
    wheelchairAccessible: false,
    seasonalRestrictions: 'Avoid flash-flood weather.',
    operationalWarnings: 'Confirm site access before departure.',
    components: [
      {
        componentType: 'TRANSPORT',
        label: 'Round-trip transport',
        routeId: 'route-amman-petra',
        transportServiceTypeId: 'service-full-day',
        requiredArrivalTime: '08:00',
        supplierConfirmationRequired: true,
        voucherRequired: true,
        pickupNotes: 'Hotel lobby pickup.',
        operationalDependency: 'Requires confirmed vehicle assignment.',
        estimatedDurationMinutes: 360,
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
  assert.equal(createdData.operatingDays, 'Daily');
  assert.equal(createdData.recommendedDepartureTime, '08:00');
  assert.equal(createdData.estimatedReturnTime, '20:00');
  assert.equal(createdData.minimumPax, 2);
  assert.equal(createdData.maximumPax, 24);
  assert.equal(createdData.weatherSensitive, true);
  assert.equal(createdData.childFriendly, true);
  assert.equal(createdData.wheelchairAccessible, false);
  assert.match(createdData.seasonalRestrictions, /flash-flood/);
  assert.match(createdData.operationalWarnings, /site access/);
  assert.deepEqual(
    createdData.components.create.map((component: any) => component.componentType),
    ['TRANSPORT', 'TICKET', 'ACTIVITY', 'DINING'],
  );
  assert.equal(createdData.components.create[0].routeId, 'route-amman-petra');
  assert.equal(createdData.components.create[0].transportServiceTypeId, 'service-full-day');
  assert.equal(createdData.components.create[0].requiredArrivalTime, '08:00');
  assert.equal(createdData.components.create[0].supplierConfirmationRequired, true);
  assert.equal(createdData.components.create[0].voucherRequired, true);
  assert.equal(createdData.components.create[0].pickupNotes, 'Hotel lobby pickup.');
  assert.equal(createdData.components.create[0].operationalDependency, 'Requires confirmed vehicle assignment.');
  assert.equal(createdData.components.create[0].estimatedDurationMinutes, 360);
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

test('previews operational blueprint workbook without flattening reusable components', async () => {
  const { service } = createExcursionTemplatesService({
    supplierService: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'ticket-petra', name: 'Petra Entrance Ticket', serviceType: { name: 'Ticket' } }],
    },
    activity: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'activity-petra', name: 'Petra Guided Walk', durationMinutes: 180 }],
    },
    transportServiceType: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'transport-full-day', name: 'Full Day', code: 'FULL_DAY' }],
    },
  });

  const preview = await service.previewOperationalBlueprintImport({ buffer: buildOperationalBlueprintWorkbook(), originalname: 'excursions.xlsx' });

  assert.equal(preview.mode, 'preview');
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.templates[0].templateCode, 'PETRA_2D');
  assert.equal(preview.templates[0].routes, 1);
  assert.equal(preview.templates[0].transportComponents, 1);
  assert.equal(preview.counts.touringRoutes, 1);
  assert.ok(preview.reusableInventory.some((entry: any) => entry.componentType === 'TRANSPORT' && entry.linkedId === 'transport-full-day'));
  assert.ok(preview.warnings.some((entry: any) => /Dining option not found/.test(entry.message)));
});

test('blocks operational blueprint workbook with duplicate templates and bad required route references', async () => {
  const { service } = createExcursionTemplatesService();
  const buffer = buildOperationalBlueprintWorkbook({
    EXCURSION_TEMPLATES: [
      { TemplateCode: 'PETRA_2D', TemplateName: 'One', DurationDays: 1, StartCity: 'Amman', Category: 'Cultural', Description: 'One', Active: 'Active' },
      { TemplateCode: 'PETRA_2D', TemplateName: 'Two', DurationDays: 1, StartCity: 'Amman', Category: 'Cultural', Description: 'Two', Active: 'Active' },
    ],
    TRANSPORT_COMPONENTS: [{ TemplateCode: 'PETRA_2D', RouteCode: 'MISSING_ROUTE', Required: 'Yes', PricingMode: 'Full Day', Notes: '' }],
  });

  const preview = await service.previewOperationalBlueprintImport({ buffer, originalname: 'bad.xlsx' });

  assert.ok(preview.errors.some((entry: any) => /Duplicate TemplateCode/.test(entry.message)));
  assert.ok(preview.errors.some((entry: any) => /Required transport component must reference a known RouteCode/.test(entry.message)));
});

test('imports operational blueprint workbook as templates, touring routes, and linked components', async () => {
  const createdTemplates: any[] = [];
  const createdRoutes: any[] = [];
  const { service } = createExcursionTemplatesService({
    excursionTemplate: {
      create: async ({ data }: any) => {
        createdTemplates.push(data);
        return { id: 'template-created', ...data };
      },
      findUnique: async ({ where }: any) => (where.code ? null : { id: where.id, code: 'PETRA_2D', components: [] }),
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
    touringRoute: {
      findUnique: async ({ where }: any) => createdRoutes.find((route: any) => route.id === where.id || route.code === where.code) || null,
      create: async ({ data }: any) => {
        const route = { id: `touring-route-${data.code}`, ...data };
        createdRoutes.push(route);
        return route;
      },
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      findMany: async () => [],
    },
    supplierService: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'ticket-petra', name: 'Petra Entrance Ticket', serviceType: { name: 'Ticket' } }],
    },
    activity: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'activity-petra', name: 'Petra Guided Walk', durationMinutes: 180 }],
    },
    transportServiceType: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'transport-full-day', name: 'Full Day', code: 'FULL_DAY' }],
    },
  });

  const imported = await service.importOperationalBlueprintWorkbook({ buffer: buildOperationalBlueprintWorkbook(), originalname: 'excursions.xlsx' });

  assert.deepEqual(imported.errors, []);
  assert.equal(imported.importedTemplates, 1);
  assert.equal(imported.importedTouringRoutes, 1);
  assert.equal(imported.importedComponents, 6);
  assert.equal(createdRoutes[0].code, 'AMM_PETRA_2D');
  assert.equal(createdRoutes[0].stops.create[0].location, 'Petra Visitor Center');
  const components = createdTemplates[0].components.create;
  assert.equal(components[0].componentType, 'TRANSPORT');
  assert.equal(components[0].touringRouteId, 'touring-route-AMM_PETRA_2D');
  assert.equal(components[0].transportServiceTypeId, 'transport-full-day');
  assert.equal(components[1].componentType, 'TICKET');
  assert.equal(components[1].supplierServiceId, 'ticket-petra');
  assert.equal(components[4].componentType, 'ACTIVITY');
  assert.equal(components[4].activityId, 'activity-petra');
});

test('fillMissingOperationalMetadata preserves existing values and fills only blank component metadata', async () => {
  const templateUpdates: any[] = [];
  const componentUpdates: any[] = [];
  const components = [
    {
      id: 'component-transport',
      componentType: 'TRANSPORT',
      label: 'Transport',
      active: true,
      isOptional: false,
      durationMinutes: 180,
      estimatedDurationMinutes: null,
      requiredArrivalTime: '',
      supplierConfirmationRequired: null,
      voucherRequired: null,
      pickupNotes: '',
      operationalDependency: null,
      route: { durationMinutes: 240 },
    },
    {
      id: 'component-dining',
      componentType: 'DINING',
      label: 'Lunch',
      active: true,
      isOptional: true,
      estimatedDurationMinutes: 75,
      requiredArrivalTime: '13:00',
      supplierConfirmationRequired: false,
      voucherRequired: false,
      pickupNotes: 'Existing dining pickup note.',
      operationalDependency: 'Existing dining dependency.',
    },
    {
      id: 'component-ticket',
      componentType: 'TICKET',
      label: 'Ticket',
      active: true,
      isOptional: false,
      estimatedDurationMinutes: null,
      requiredArrivalTime: null,
      supplierConfirmationRequired: null,
      voucherRequired: null,
      pickupNotes: null,
      operationalDependency: '',
    },
  ];
  const { service } = createExcursionTemplatesService({
    excursionTemplate: {
      findUnique: async () => ({
        id: 'template-1',
        code: 'TEST_TEMPLATE',
        name: 'Test Template',
        defaultDepartureCity: 'Amman',
        recommendedDepartureTime: '08:00',
        operationalWarnings: '',
        components,
      }),
      update: async ({ where, data }: any) => {
        templateUpdates.push({ where, data });
        return { id: where.id, ...data };
      },
    },
    excursionTemplateComponent: {
      update: async ({ where, data }: any) => {
        componentUpdates.push({ where, data });
        return { id: where.id, ...data };
      },
    },
  });

  const result = await service.fillMissingOperationalMetadata('template-1');

  assert.deepEqual(templateUpdates, [
    {
      where: { id: 'template-1' },
      data: { operationalWarnings: 'Operational details to confirm before use.' },
    },
  ]);
  assert.deepEqual(componentUpdates, [
    {
      where: { id: 'component-transport' },
      data: {
        estimatedDurationMinutes: 180,
        requiredArrivalTime: '08:00',
        supplierConfirmationRequired: true,
        voucherRequired: true,
        pickupNotes: 'Pickup from Amman to confirm.',
        operationalDependency: 'Requires confirmed route, vehicle, supplier, pickup time, and pax count.',
      },
    },
    {
      where: { id: 'component-ticket' },
      data: {
        requiredArrivalTime: 'To confirm',
        voucherRequired: true,
        pickupNotes: 'Ticket handoff or entry process to confirm.',
        operationalDependency: 'Requires confirmed visit date, pax count, and ticketing rules.',
      },
    },
  ]);
  assert.equal(componentUpdates.some((update) => update.where.id === 'component-dining'), false);
  assert.equal(result.updatedTemplateFields, 1);
  assert.equal(result.updatedComponentFields, 10);
  assert.equal(result.skippedExistingFields, 6);
  assert.match(result.message, /Filled 11 blank operational metadata fields/);
});

test('fillMissingOperationalMetadata is idempotent when operational metadata is already filled', async () => {
  let templateUpdateCount = 0;
  let componentUpdateCount = 0;
  const { service } = createExcursionTemplatesService({
    excursionTemplate: {
      findUnique: async () => ({
        id: 'template-1',
        code: 'TEST_TEMPLATE',
        name: 'Test Template',
        operationalWarnings: 'Already confirmed.',
        components: [
          {
            id: 'component-activity',
            componentType: 'ACTIVITY',
            label: 'Activity',
            active: true,
            estimatedDurationMinutes: 90,
            requiredArrivalTime: '10:00',
            supplierConfirmationRequired: true,
            voucherRequired: true,
            pickupNotes: 'Existing pickup.',
            operationalDependency: 'Existing dependency.',
          },
        ],
      }),
      update: async () => {
        templateUpdateCount += 1;
      },
    },
    excursionTemplateComponent: {
      update: async () => {
        componentUpdateCount += 1;
      },
    },
  });

  const result = await service.fillMissingOperationalMetadata('template-1');

  assert.equal(templateUpdateCount, 0);
  assert.equal(componentUpdateCount, 0);
  assert.equal(result.updatedTemplateFields, 0);
  assert.equal(result.updatedComponentFields, 0);
  assert.equal(result.skippedExistingFields, 7);
  assert.equal(result.message, 'No blank metadata fields needed filling.');
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

test('Wadi Rum Full Day seed template links Activity Master records and preserves optional component order', async () => {
  let createdData: any;
  const activities = [
    { id: 'activity-jeep', name: 'Wadi Rum Jeep Tour' },
    { id: 'activity-camel', name: 'Wadi Rum Camel Ride' },
    { id: 'activity-sunset', name: 'Wadi Rum Sunset Experience' },
    { id: 'activity-stargazing', name: 'Wadi Rum Stargazing Experience' },
  ];
  const { service } = createExcursionTemplatesService({
    excursionTemplate: {
      findUnique: async () => null,
      create: async ({ data }: any) => {
        createdData = data;
        return { id: 'template-wadi-rum', ...data };
      },
    },
    supplierService: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'service-bedouin-dinner', name: 'Wadi Rum Bedouin Dinner' }],
    },
    activity: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => activities,
    },
    route: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'route-amman-wadi-rum', name: 'Amman to Wadi Rum', durationMinutes: 300 }],
    },
    transportServiceType: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'service-full-day', name: 'Full Day', classification: 'FULL_DAY' }],
    },
  });

  await service.ensureWadiRumFullDayTemplate();

  assert.equal(createdData.code, 'WADI_RUM_FULL_DAY');
  assert.equal(createdData.name, 'Wadi Rum Full Day');
  assert.equal(createdData.defaultDepartureCity, 'Amman or Aqaba');
  assert.equal(createdData.durationMinutes, 720);
  assert.deepEqual(
    createdData.components.create.map((component: any) => component.componentType),
    ['TRANSPORT', 'ACTIVITY', 'ACTIVITY', 'DINING', 'ACTIVITY', 'ACTIVITY'],
  );
  assert.equal(createdData.components.create[0].routeId, 'route-amman-wadi-rum');
  assert.equal(createdData.components.create[0].transportServiceTypeId, 'service-full-day');
  assert.equal(createdData.components.create[1].activityId, 'activity-jeep');
  assert.equal(createdData.components.create[1].isOptional, false);
  assert.equal(createdData.components.create[2].activityId, 'activity-camel');
  assert.equal(createdData.components.create[2].isOptional, true);
  assert.equal(createdData.components.create[3].supplierServiceId, 'service-bedouin-dinner');
  assert.equal(createdData.components.create[3].isOptional, true);
  assert.equal(createdData.components.create[4].activityId, 'activity-sunset');
  assert.equal(createdData.components.create[4].isOptional, true);
  assert.equal(createdData.components.create[5].activityId, 'activity-stargazing');
  assert.equal(createdData.components.create[5].isOptional, true);
});

test('ensure endpoints update existing templates by code instead of creating duplicates', async () => {
  let createCalls = 0;
  let updateCalls = 0;
  let deletedComponentsFor: string | undefined;
  const { service } = createExcursionTemplatesService({
    excursionTemplate: {
      findUnique: async ({ where }: any) =>
        where.code === 'JERASH_AMMAN_FULL_DAY' || where.code === 'WADI_RUM_FULL_DAY' || where.id === 'template-existing'
          ? { id: 'template-existing', code: where.code || 'JERASH_AMMAN_FULL_DAY', components: [] }
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
  await service.ensureWadiRumFullDayTemplate();

  assert.equal(createCalls, 0);
  assert.equal(updateCalls, 2);
  assert.equal(deletedComponentsFor, 'template-existing');
});

test('component editing reorders active components and soft removes without deleting rows', async () => {
  const updates: any[] = [];
  let deleteCalls = 0;
  const { service } = createExcursionTemplatesService({
    excursionTemplate: {
      findUnique: async ({ where }: any) => ({
        id: where.id,
        components: [
          { id: 'component-a', componentType: 'TRANSPORT', active: true },
          { id: 'component-b', componentType: 'TICKET', active: true },
        ],
      }),
    },
    excursionTemplateComponent: {
      deleteMany: async () => {
        deleteCalls += 1;
        return { count: 0 };
      },
      findFirst: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'component-a' }, { id: 'component-b' }],
      update: async ({ where, data }: any) => {
        updates.push({ where, data });
        return { id: where.id, ...data };
      },
    },
  });

  await service.reorderComponents('template-1', { componentIds: ['component-b', 'component-a'] });
  await service.updateComponent('template-1', 'component-b', {
    isOptional: true,
    requiredArrivalTime: '09:15',
    supplierConfirmationRequired: true,
    voucherRequired: true,
    pickupNotes: 'Meet at visitor center.',
    operationalDependency: 'Ticket must be issued first.',
    estimatedDurationMinutes: 45,
  });
  await service.removeComponent('template-1', 'component-a');

  assert.equal(deleteCalls, 0);
  assert.deepEqual(updates[0], { where: { id: 'component-b' }, data: { sortOrder: 0 } });
  assert.deepEqual(updates[1], { where: { id: 'component-a' }, data: { sortOrder: 1 } });
  assert.deepEqual(updates[2], {
    where: { id: 'component-b' },
    data: {
      isOptional: true,
      requiredArrivalTime: '09:15',
      supplierConfirmationRequired: true,
      voucherRequired: true,
      pickupNotes: 'Meet at visitor center.',
      operationalDependency: 'Ticket must be issued first.',
      estimatedDurationMinutes: 45,
    },
  });
  assert.equal(updates[3].where.id, 'component-a');
  assert.equal(updates[3].data.active, false);
  assert.match(updates[3].data.operationalNotes, /Soft removed/);
});

test('add component links existing catalog records and appends to active sequence', async () => {
  let createdComponent: any;
  const { service } = createExcursionTemplatesService({
    excursionTemplate: {
      findUnique: async ({ where }: any) => ({
        id: where.id,
        components: [{ id: 'component-existing', active: true }],
      }),
    },
    excursionTemplateComponent: {
      create: async ({ data }: any) => {
        createdComponent = data;
        return { id: 'component-new', ...data };
      },
      findFirst: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
  });

  await service.addComponent('template-1', {
    componentType: 'ACTIVITY',
    label: 'Wadi Rum Stargazing Experience',
    activityId: 'activity-stargazing',
    isOptional: true,
    requiredArrivalTime: '20:00',
    supplierConfirmationRequired: true,
    voucherRequired: false,
    pickupNotes: 'Pickup from camp reception.',
    operationalDependency: 'Weather clearance required.',
    estimatedDurationMinutes: 90,
  });

  assert.equal(createdComponent.templateId, 'template-1');
  assert.equal(createdComponent.componentType, 'ACTIVITY');
  assert.equal(createdComponent.activityId, 'activity-stargazing');
  assert.equal(createdComponent.sortOrder, 1);
  assert.equal(createdComponent.active, true);
  assert.equal(createdComponent.isOptional, true);
  assert.equal(createdComponent.requiredArrivalTime, '20:00');
  assert.equal(createdComponent.supplierConfirmationRequired, true);
  assert.equal(createdComponent.voucherRequired, false);
  assert.equal(createdComponent.pickupNotes, 'Pickup from camp reception.');
  assert.equal(createdComponent.operationalDependency, 'Weather clearance required.');
  assert.equal(createdComponent.estimatedDurationMinutes, 90);
});

test('Sindbad Aqaba ensure creates Activity Master records with confirmed supplier variant pricing', async () => {
  const createdActivities: any[] = [];
  const createdTemplates: any[] = [];
  const { service } = createExcursionTemplatesService({
    excursionTemplate: {
      findUnique: async ({ where }: any) => (where.id ? { id: where.id, components: [] } : null),
      create: async ({ data }: any) => {
        createdTemplates.push(data);
        return { id: `template-${createdTemplates.length}`, ...data };
      },
    },
    activity: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findFirst: async () => null,
      create: async ({ data }: any) => {
        createdActivities.push(data);
        return { id: `activity-${createdActivities.length}`, name: data.name, ...data };
      },
      findMany: async () => [],
    },
    route: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'route-aqaba-city', name: 'Aqaba City Center - Aqaba South Beach', durationMinutes: 30 }],
    },
    transportServiceType: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [{ id: 'service-full-day', name: 'Full Day', classification: 'FULL_DAY' }],
    },
    supplierService: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [],
    },
  });

  const result = await service.ensureSindbadAqabaCatalog();

  const variant = (activity: any, name: string) => activity.rateVariants.create.find((item: any) => item.name === name);

  assert.equal(result.activities.length, 9);
  assert.equal(createdActivities.length, 9);
  const berenice = createdActivities.find((activity) => activity.name === 'Berenice Beach Club');
  assert.ok(berenice);
  assert.equal(berenice.pricingBasis, 'PER_PERSON');
  assert.equal(variant(berenice, 'Day Pass Adult').costPrice, 15);
  assert.equal(variant(berenice, 'Day Pass Adult').sellPrice, 15);
  assert.equal(variant(berenice, 'Day Pass Child').costPrice, 10);
  assert.equal(variant(berenice, 'Day Pass Child').currency, 'JOD');
  assert.equal(variant(berenice, '3 Day Pass').costPrice, 0);
  assert.match(variant(berenice, '3 Day Pass').notes, /Pricing pending/);

  const waterSports = createdActivities.find((activity) => activity.name === 'Aqaba Water Sports');
  assert.ok(waterSports);
  assert.equal(variant(waterSports, 'Banana Boat').costPrice, 8);
  assert.equal(variant(waterSports, 'Banana Boat').durationMinutes, 7);
  assert.match(variant(waterSports, 'Banana Boat').notes, /Minimum 3 persons/);
  assert.equal(variant(waterSports, 'Inner Tubes').costPrice, 9);
  assert.equal(variant(waterSports, 'Inner Tubes').maxPaxPerUnit, 2);
  assert.equal(variant(waterSports, 'Fly Fish').maxPaxPerUnit, 3);
  assert.equal(variant(waterSports, 'Guest on boat during banana/tubes/ski').costPrice, 5);

  const jetSki = createdActivities.find((activity) => activity.name === 'Jet Ski');
  assert.equal(variant(jetSki, '15 min').costPrice, 30);
  assert.equal(variant(jetSki, '15 min').durationMinutes, 15);
  assert.equal(variant(jetSki, '15 min double rider').costPrice, 45);
  assert.equal(variant(jetSki, '15 min double rider').pricingBasis, 'PER_GROUP');
  assert.equal(variant(jetSki, '15 min double rider').maxPaxPerUnit, 2);
  assert.match(variant(jetSki, '15 min double rider').notes, /Price per 2 persons/);

  const parasailing = createdActivities.find((activity) => activity.name === 'Parasailing');
  assert.equal(variant(parasailing, 'Single').costPrice, 40);
  assert.equal(variant(parasailing, 'Single').durationMinutes, 15);
  assert.equal(variant(parasailing, 'Guest on boat').costPrice, 10);

  const snorkeling = createdActivities.find((activity) => activity.name === 'Snorkeling Cruise');
  assert.equal(variant(snorkeling, 'Red Sea Experience Special Package Adult').costPrice, 30);
  assert.equal(variant(snorkeling, 'Red Sea Experience Special Package Adult').durationMinutes, 240);
  assert.equal(variant(snorkeling, 'BBQ Lunch Supplement').costPrice, 10);
  assert.equal(variant(snorkeling, 'Discovery Glass Bottom Boat').costPrice, 0);
  assert.match(variant(snorkeling, 'Discovery Glass Bottom Boat').notes, /Pricing pending/);

  const diving = createdActivities.find((activity) => activity.name === 'Discover Scuba Diving');
  assert.equal(variant(diving, 'Discover Scuba Diving').costPrice, 50);
  assert.equal(variant(diving, 'DSD 2 Dives').costPrice, 90);
  assert.equal(variant(diving, 'Leisure Diving 2 Dives').costPrice, 60);
  assert.match(variant(diving, 'Leisure Diving 2 Dives').notes, /Certified divers only/);

  const privateBoat = createdActivities.find((activity) => activity.name === 'Private Boat Rental');
  assert.equal(privateBoat.pricingBasis, 'PER_GROUP');
  assert.equal(variant(privateBoat, 'Sindbad Motor Boat').costPrice, 200);
  assert.equal(variant(privateBoat, 'Sindbad Motor Boat').durationMinutes, 120);
  assert.equal(variant(privateBoat, 'Sindbad Motor Boat').maxPaxPerUnit, 50);
  assert.match(variant(privateBoat, 'Sindbad Motor Boat').notes, /Extra sailing hour 80 JOD/);
  assert.equal(variant(privateBoat, 'Aladdin Sailing Ketch').costPrice, 300);
  assert.equal(variant(privateBoat, 'Aladdin Sailing Ketch').maxPaxPerUnit, 90);
  assert.match(variant(privateBoat, 'Aladdin Sailing Ketch').notes, /Capacity 70-90/);
  assert.equal(variant(privateBoat, 'Speed Boat up to 6 persons').costPrice, 35);
  assert.equal(variant(privateBoat, 'Speed Boat up to 6 persons').durationMinutes, 15);

  const beachKitchen = createdActivities.find((activity) => activity.name === 'Aqaba Beach Kitchen Experience');
  assert.equal(variant(beachKitchen, '4 guests and over').costPrice, 40);
  assert.equal(variant(beachKitchen, '8 guests and over').costPrice, 35);
  assert.match(beachKitchen.description, /fish\/vegetable market visit/);
  assert.deepEqual(
    createdTemplates.map((template) => template.code),
    ['AQABA_SNORKELING_DAY', 'AQABA_SUNSET_CRUISE', 'AQABA_DISCOVER_SCUBA', 'AQABA_PRIVATE_BOAT_DAY'],
  );
  assert.deepEqual(
    createdTemplates[0].components.create.map((component: any) => component.componentType),
    ['TRANSPORT', 'ACTIVITY', 'ACTIVITY', 'DINING'],
  );
});

test('Sindbad Aqaba ensure updates existing activity variants and templates without duplicates', async () => {
  let activityCreateCalls = 0;
  let activityUpdateCalls = 0;
  let templateCreateCalls = 0;
  let templateUpdateCalls = 0;
  const { service } = createExcursionTemplatesService({
    excursionTemplate: {
      findUnique: async ({ where }: any) =>
        where.id
          ? { id: where.id, components: [] }
          : { id: `existing-${where.code}`, code: where.code, components: [] },
      create: async () => {
        templateCreateCalls += 1;
        return { id: 'template-new' };
      },
      update: async ({ where, data }: any) => {
        templateUpdateCalls += 1;
        return { id: where.id, ...data };
      },
    },
    excursionTemplateComponent: {
      deleteMany: async () => ({ count: 0 }),
      findFirst: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
    activity: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findFirst: async ({ where }: any) => ({ id: `existing-${where.name.equals}`, name: where.name.equals, rateVariants: [] }),
      create: async () => {
        activityCreateCalls += 1;
        return { id: 'activity-new' };
      },
      update: async ({ where, data }: any) => {
        activityUpdateCalls += 1;
        return { id: where.id, ...data };
      },
      findMany: async () => [],
    },
    activityRateVariant: {
      findMany: async () => [{ id: 'variant-old', name: 'Old Variant' }],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      create: async ({ data }: any) => ({ id: 'variant-new', ...data }),
      updateMany: async () => ({ count: 1 }),
    },
    supplierService: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      findMany: async () => [],
    },
  });

  await service.ensureSindbadAqabaCatalog();

  assert.equal(activityCreateCalls, 0);
  assert.equal(activityUpdateCalls, 9);
  assert.equal(templateCreateCalls, 0);
  assert.equal(templateUpdateCalls, 4);
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
  assert.deepEqual((Reflect as any).getMetadata(ROLES_KEY, ExcursionTemplatesController.prototype.ensureWadiRumFullDayTemplate), [
    'admin',
    'operations',
  ]);
  assert.deepEqual((Reflect as any).getMetadata(ROLES_KEY, ExcursionTemplatesController.prototype.addComponent), ['admin', 'operations']);
  assert.deepEqual((Reflect as any).getMetadata(ROLES_KEY, ExcursionTemplatesController.prototype.reorderComponents), [
    'admin',
    'operations',
  ]);
  assert.deepEqual((Reflect as any).getMetadata(ROLES_KEY, ExcursionTemplatesController.prototype.updateComponent), [
    'admin',
    'operations',
  ]);
  assert.deepEqual((Reflect as any).getMetadata(ROLES_KEY, ExcursionTemplatesController.prototype.removeComponent), [
    'admin',
    'operations',
  ]);
  assert.deepEqual((Reflect as any).getMetadata(ROLES_KEY, ExcursionTemplatesController.prototype.ensureSindbadAqabaCatalog), [
    'admin',
    'operations',
  ]);
});
