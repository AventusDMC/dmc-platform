{
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const XLSX = require('xlsx');
const { buildCanonicalTouringRouteCode, TouringRoutesService } = require('./touring-routes.service');

const apiRoot = process.cwd().endsWith(join('apps', 'api')) ? process.cwd() : join(process.cwd(), 'apps', 'api');
const schemaSource = readFileSync(join(apiRoot, 'prisma', 'schema.prisma'), 'utf8');
const controllerSource = readFileSync(join(apiRoot, 'src', 'touring-routes', 'touring-routes.controller.ts'), 'utf8');

function createAuditPrismaMock(routes: any[], counts: Record<string, number> = {}) {
  const countFor = (modelName: string) => async ({ where }: any = {}) => {
    const routeId = where?.touringRouteId || 'none';
    const activeKey =
      where?.quote?.status || where?.booking?.status || where?.active === true || where?.booking?.seriesDeparture ? ':active' : '';
    return counts[`${modelName}:${routeId}${activeKey}`] ?? counts[`${modelName}:${routeId}`] ?? 0;
  };

  return {
    touringRoute: {
      findMany: async () => routes,
      count: countFor('touringRoute'),
    },
    route: {
      findMany: async () => {
        throw new Error('transfer routes must not be queried by touring route audit');
      },
      update: async () => {
        throw new Error('transfer routes must not be mutated by touring route audit');
      },
    },
    touringRoutePricing: {
      create: async () => {
        throw new Error('audit preview must not create pricing rows');
      },
      update: async () => {
        throw new Error('audit preview must not update pricing rows');
      },
    },
    quoteItem: {
      count: countFor('quoteItem'),
      update: async () => {
        throw new Error('audit preview must not update quote items');
      },
    },
    excursionTemplateComponent: {
      count: countFor('excursionTemplateComponent'),
      update: async () => {
        throw new Error('audit preview must not update excursion template components');
      },
    },
    packageTemplateComponent: {
      count: countFor('packageTemplateComponent'),
      update: async () => {
        throw new Error('audit preview must not update package template components');
      },
    },
    bookingService: {
      count: countFor('bookingService'),
      update: async () => {
        throw new Error('audit preview must not update booking services');
      },
    },
    activity: {
      count: countFor('activity'),
      findMany: async () => [],
      findFirst: async () => null,
      create: async () => {
        throw new Error('dry-run must not create activities');
      },
    },
    excursionTemplate: {
      count: countFor('excursionTemplate'),
      create: async () => {
        throw new Error('dry-run must not create excursion templates');
      },
    },
    place: {
      findMany: async () => [],
      create: async () => {
        throw new Error('dry-run must not create places');
      },
    },
  };
}

test('touring route schema exposes safe classification fields without touching transfer routes', () => {
  for (const field of [
    'region',
    'operationalType',
    'routeCategory',
    'guideRequired',
    'overnight',
    'sicPossible',
    'departureCapable',
    'capacityBased',
    'primaryOperatingCity',
    'operationalComplexity',
  ]) {
    assert.match(schemaSource, new RegExp(`${field}\\s+`));
  }

  assert.match(controllerSource, /operational-audit\/preview/);
  assert.match(controllerSource, /operational-audit\/export/);
});

test('canonical touring route code uses JOR-TR region and route name consistently', () => {
  assert.equal(
    buildCanonicalTouringRouteCode({
      region: 'South',
      name: 'Amman -> Madaba -> Nebo -> Petra ON',
      startCity: 'Amman',
      mainDestinations: ['Madaba', 'Mount Nebo', 'Petra'],
    }),
    'JOR-TR-SOUTH-AMMAN-MADABA-NEBO-PETRA-OVERNIGHT',
  );
  assert.equal(
    buildCanonicalTouringRouteCode({
      region: 'Aqaba',
      name: 'Aqaba -> Glass Boat Pier -> Aqaba RT',
      startCity: 'Aqaba',
      mainDestinations: ['Glass Boat Pier'],
    }),
    'JOR-TR-AQABA-AQABA-GLASS-BOAT-PIER-AQABA-ROUND-TRIP',
  );
});

test('touring route audit preserves old codes as aliases and separates non-touring candidates', async () => {
  const routes = [
    {
      id: 'tour-true',
      code: 'JOR-TR-001',
      name: 'Amman -> Madaba -> Nebo -> Petra ON',
      startCity: 'Amman',
      durationDays: 2,
      region: 'South',
      overnightRisk: true,
      active: true,
      mainDestinations: ['Madaba', 'Mount Nebo', 'Petra'],
      stops: [
        { order: 1, city: 'Amman' },
        { order: 2, city: 'Madaba' },
        { order: 3, city: 'Mount Nebo' },
        { order: 4, city: 'Petra', notes: 'Overnight stop' },
      ],
      pricings: [{ pricingBasis: 'PER_VEHICLE', maxPax: 6 }],
    },
    {
      id: 'aqaba-activity',
      code: 'JOR-TR-AQABA-GLASS-BOAT-RT',
      name: 'Aqaba -> Glass Boat Pier -> Aqaba RT',
      startCity: 'Aqaba',
      durationDays: 1,
      region: 'Aqaba',
      active: true,
      mainDestinations: ['Glass Boat Pier'],
      stops: [{ order: 1, city: 'Aqaba', location: 'Glass Boat Pier' }],
      pricings: [],
    },
    {
      id: 'simple-day-tour',
      code: 'JERASH-FD',
      name: 'Jerash Full Day Tour',
      startCity: 'Amman',
      durationDays: 1,
      region: 'North',
      active: true,
      mainDestinations: ['Jerash'],
      stops: [{ order: 1, city: 'Jerash' }],
      pricings: [],
    },
    {
      id: 'one-way-transfer',
      code: 'AMM-PET-OW',
      name: 'Amman -> Petra OW',
      startCity: 'Amman',
      durationDays: 1,
      region: 'South',
      active: true,
      mainDestinations: ['Petra'],
      stops: [{ order: 1, city: 'Petra' }],
      pricings: [],
    },
  ];
  const service = new TouringRoutesService(createAuditPrismaMock(routes) as any);

  const audit = (await service.previewOperationalAudit()) as any;
  const byId = new Map<string, any>(audit.rows.map((row: any) => [row.id, row]));

  assert.equal(audit.mutatesData, false);
  assert.equal(byId.get('tour-true').classification, 'TOURING_ROUTE');
  assert.equal(byId.get('tour-true').cleanupRecommendation, 'KEEP_AS_TOURING_ROUTE');
  assert.equal(byId.get('tour-true').selectorEligible, true);
  assert.deepEqual(byId.get('tour-true').legacyAliases, ['JOR-TR-001']);
  assert.equal(byId.get('tour-true').suggestedCanonicalCode, 'JOR-TR-SOUTH-AMMAN-MADABA-NEBO-PETRA-OVERNIGHT');
  assert.equal(byId.get('tour-true').safeFields.operationalType, 'ROUTING_SKELETON');
  assert.equal(byId.get('tour-true').safeFields.overnight, true);
  assert.equal(byId.get('tour-true').safeFields.guideRequired, true);

  assert.equal(byId.get('aqaba-activity').classification, 'ACTIVITY_CANDIDATE');
  assert.equal(byId.get('aqaba-activity').cleanupRecommendation, 'MOVE_TO_ACTIVITY_MASTER');
  assert.equal(byId.get('aqaba-activity').candidateTarget, 'ACTIVITY');
  assert.equal(byId.get('aqaba-activity').selectorEligible, false);

  assert.equal(byId.get('simple-day-tour').classification, 'EXCURSION_TEMPLATE_CANDIDATE');
  assert.equal(byId.get('simple-day-tour').cleanupRecommendation, 'CONVERT_TO_EXCURSION_TEMPLATE');
  assert.equal(byId.get('simple-day-tour').candidateTarget, 'EXCURSION_TEMPLATE');
  assert.equal(byId.get('simple-day-tour').selectorEligible, false);

  assert.equal(byId.get('one-way-transfer').classification, 'TRANSFER_ROUTE_CANDIDATE');
  assert.equal(byId.get('one-way-transfer').cleanupRecommendation, 'MOVE_TO_TRANSFER_ROUTE');
  assert.equal(byId.get('one-way-transfer').candidateTarget, 'OPERATIONAL_TRANSFER');
  assert.equal(byId.get('one-way-transfer').selectorEligible, false);
  assert.equal(audit.counts.selectorEligible, 1);
  assert.equal(audit.recommendationCounts.KEEP_AS_TOURING_ROUTE, 1);
  assert.equal(audit.recommendationCounts.MOVE_TO_ACTIVITY_MASTER, 1);
  assert.equal(audit.recommendationCounts.CONVERT_TO_EXCURSION_TEMPLATE, 1);
  assert.equal(audit.recommendationCounts.MOVE_TO_TRANSFER_ROUTE, 1);
});

test('touring route cleanup recommendations are planning-only by operational route family', async () => {
  const routes = [
    {
      id: 'aqaba-water',
      code: 'AQABA-WATER',
      name: 'Aqaba South Beach Snorkel Experience',
      startCity: 'Aqaba',
      durationDays: 1,
      region: 'Aqaba',
      active: true,
      mainDestinations: ['South Beach'],
      stops: [{ order: 1, city: 'Aqaba', location: 'South Beach' }],
      pricings: [],
    },
    {
      id: 'aqaba-boat',
      code: 'AQABA-BOAT',
      name: 'Aqaba Glass Boat and Marina Experience',
      startCity: 'Aqaba',
      durationDays: 1,
      region: 'Aqaba',
      active: true,
      mainDestinations: ['Marina'],
      stops: [{ order: 1, city: 'Aqaba', location: 'Glass Boat Pier' }],
      pricings: [],
    },
    {
      id: 'petra-day',
      code: 'PETRA-FD',
      name: 'Petra Full Day Tour',
      startCity: 'Amman',
      durationDays: 1,
      region: 'South',
      active: true,
      mainDestinations: ['Petra'],
      stops: [{ order: 1, city: 'Petra' }],
      pricings: [],
    },
    {
      id: 'jerash-day',
      code: 'JERASH-FD',
      name: 'Jerash Full Day Tour',
      startCity: 'Amman',
      durationDays: 1,
      region: 'North',
      active: true,
      mainDestinations: ['Jerash'],
      stops: [{ order: 1, city: 'Jerash' }],
      pricings: [],
    },
    {
      id: 'madaba-day',
      code: 'MADABA-FD',
      name: 'Madaba and Mount Nebo Full Day Tour',
      startCity: 'Amman',
      durationDays: 1,
      region: 'Central',
      active: true,
      mainDestinations: ['Madaba', 'Mount Nebo'],
      stops: [{ order: 1, city: 'Madaba' }, { order: 2, city: 'Mount Nebo' }],
      pricings: [],
    },
    {
      id: 'north-circuit',
      code: 'NORTH-CIRCUIT',
      name: 'North Jordan Circuit',
      startCity: 'Amman',
      durationDays: 1,
      region: 'North',
      active: true,
      mainDestinations: ['Jerash', 'Ajloun', 'Umm Qais'],
      stops: [{ order: 1, city: 'Jerash' }, { order: 2, city: 'Ajloun' }, { order: 3, city: 'Umm Qais' }],
      pricings: [],
    },
    {
      id: 'south-circuit',
      code: 'SOUTH-CIRCUIT',
      name: 'South Jordan Overnight Circuit',
      startCity: 'Amman',
      durationDays: 2,
      region: 'South',
      overnightRisk: true,
      active: true,
      mainDestinations: ['Petra', 'Wadi Rum', 'Aqaba'],
      stops: [{ order: 1, city: 'Petra' }, { order: 2, city: 'Wadi Rum' }, { order: 3, city: 'Aqaba' }],
      pricings: [],
    },
    {
      id: 'layover-circuit',
      code: 'LAYOVER-CIRCUIT',
      name: 'Amman Layover Circuit',
      startCity: 'Amman',
      durationDays: 1,
      region: 'Central',
      active: true,
      mainDestinations: ['Amman Citadel', 'Roman Theater', 'Downtown Amman'],
      stops: [{ order: 1, city: 'Amman', location: 'Citadel' }, { order: 2, city: 'Amman', location: 'Roman Theater' }],
      pricings: [],
    },
    {
      id: 'religious-circuit',
      code: 'RELIGIOUS-CIRCUIT',
      name: 'Biblical Jordan Religious Circuit',
      startCity: 'Amman',
      durationDays: 2,
      region: 'Central',
      active: true,
      mainDestinations: ['Madaba', 'Mount Nebo', 'Bethany'],
      stops: [{ order: 1, city: 'Madaba' }, { order: 2, city: 'Mount Nebo' }, { order: 3, city: 'Bethany' }],
      pricings: [],
    },
    {
      id: 'one-way',
      code: 'AMM-PET-OW',
      name: 'Amman to Petra One Way',
      startCity: 'Amman',
      durationDays: 1,
      region: 'South',
      active: true,
      mainDestinations: ['Petra'],
      stops: [{ order: 1, city: 'Petra' }],
      pricings: [],
    },
    {
      id: 'camp-transfer',
      code: 'WR-CAMP-OW',
      name: 'Wadi Rum Village to Camp Area OW',
      startCity: 'Wadi Rum Village',
      durationDays: 1,
      region: 'South',
      active: true,
      mainDestinations: ['Wadi Rum Camp Area'],
      stops: [{ order: 1, city: 'Wadi Rum Village' }, { order: 2, city: 'Wadi Rum Camp Area' }],
      pricings: [],
    },
  ];
  const service = new TouringRoutesService(createAuditPrismaMock(routes) as any);

  const audit = (await service.previewOperationalAudit()) as any;
  const byId = new Map<string, any>(audit.rows.map((row: any) => [row.id, row]));

  assert.equal(audit.mutatesData, false);
  for (const id of ['aqaba-water', 'aqaba-boat']) {
    assert.equal(byId.get(id).cleanupRecommendation, 'MOVE_TO_ACTIVITY_MASTER');
  }
  for (const id of ['petra-day', 'jerash-day', 'madaba-day']) {
    assert.equal(byId.get(id).cleanupRecommendation, 'CONVERT_TO_EXCURSION_TEMPLATE');
  }
  for (const id of ['north-circuit', 'south-circuit', 'layover-circuit', 'religious-circuit']) {
    assert.equal(byId.get(id).cleanupRecommendation, 'KEEP_AS_TOURING_ROUTE');
  }
  assert.equal(byId.get('one-way').cleanupRecommendation, 'MOVE_TO_TRANSFER_ROUTE');
  assert.ok(['MOVE_TO_TRANSFER_ROUTE', 'MANUAL_REVIEW'].includes(byId.get('camp-transfer').cleanupRecommendation));
  assert.equal(audit.recommendationCounts.MOVE_TO_ACTIVITY_MASTER, 2);
  assert.equal(audit.recommendationCounts.CONVERT_TO_EXCURSION_TEMPLATE, 3);
  assert.equal(audit.recommendationCounts.KEEP_AS_TOURING_ROUTE, 4);
});

test('touring route audit export writes preview rows without mutating data', async () => {
  const service = new TouringRoutesService(
    createAuditPrismaMock([
      {
        id: 'tour-true',
        code: 'JOR-TR-001',
        name: 'Amman -> Madaba -> Nebo -> Petra ON',
        startCity: 'Amman',
        durationDays: 2,
        region: 'South',
        active: true,
        mainDestinations: ['Petra'],
        stops: [],
        pricings: [],
      },
    ]) as any,
  );

  const exported = await service.exportOperationalAuditWorkbook();
  const workbook = XLSX.read(exported.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Touring Route Audit'], { defval: '' }) as Array<Record<string, unknown>>;

  assert.equal(exported.fileName, 'touring-route-operational-audit.xlsx');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['Suggested Canonical Code'], 'JOR-TR-SOUTH-AMMAN-MADABA-NEBO-PETRA-OVERNIGHT');
  assert.equal(rows[0]['Cleanup Recommendation'], 'KEEP_AS_TOURING_ROUTE');
  assert.equal(rows[0]['Legacy Aliases'], 'JOR-TR-001');
});

test('touring route cleanup execution preview reports impact and actions without mutation', async () => {
  const service = new TouringRoutesService(
    createAuditPrismaMock(
      [
        {
          id: 'petra-day',
          code: 'PETRA-FD',
          name: 'Petra Full Day Tour',
          startCity: 'Amman',
          durationDays: 1,
          region: 'South',
          active: true,
          mainDestinations: ['Petra'],
          stops: [{ order: 1, city: 'Petra' }],
          pricings: [],
        },
      ],
      {
        'quoteItem:petra-day': 3,
        'quoteItem:petra-day:active': 1,
        'excursionTemplateComponent:petra-day': 2,
        'excursionTemplateComponent:petra-day:active': 1,
        'packageTemplateComponent:petra-day': 1,
        'packageTemplateComponent:petra-day:active': 1,
        'bookingService:petra-day': 2,
        'bookingService:petra-day:active': 1,
        'activity:none': 1,
        'excursionTemplate:none': 1,
        'touringRoute:none': 1,
      },
    ) as any,
  );

  const audit = (await service.previewOperationalAudit()) as any;
  const row = audit.rows[0];

  assert.equal(row.cleanupRecommendation, 'CONVERT_TO_EXCURSION_TEMPLATE');
  assert.equal(row.cleanupPreview.mutatesData, false);
  assert.equal(row.cleanupPreview.safeToConvert, false);
  assert.deepEqual(
    row.cleanupPreview.actions.map((action: any) => action.action),
    ['convertToExcursionTemplatePreview', 'archiveTouringRoutePreview'],
  );
  assert.equal(row.cleanupPreview.impact.affectedQuotes.total, 3);
  assert.equal(row.cleanupPreview.impact.affectedQuotes.active, 1);
  assert.equal(row.cleanupPreview.impact.affectedTemplates.total, 3);
  assert.equal(row.cleanupPreview.impact.affectedBookings.total, 2);
  assert.equal(row.cleanupPreview.impact.affectedBookings.active, 1);
  assert.equal(row.cleanupPreview.impact.affectedSelectorReferences.total, 4);
  assert.equal(row.cleanupPreview.impact.affectedRouteAliases.preserved, true);
  assert.deepEqual(
    row.cleanupPreview.executionDryRuns.map((dryRun: any) => dryRun.action),
    ['executeConvertToExcursionTemplateDryRun', 'executeArchiveTouringRouteDryRun'],
  );
  assert.equal(row.cleanupPreview.executionDryRuns[0].mode, 'DRY_RUN_ONLY');
  assert.equal(row.cleanupPreview.executionDryRuns[0].mutatesData, false);
  assert.equal(row.cleanupPreview.executionDryRuns[0].deletesData, false);
  assert.equal(row.cleanupPreview.executionDryRuns[0].rollbackSnapshotPreview.touringRoute.code, 'PETRA-FD');
  assert.equal(row.cleanupPreview.executionDryRuns[0].referenceMigrationPreview.aliases.preserved, true);
  assert.equal(row.cleanupPreview.executionDryRuns[0].conflicts.existingActivityDuplicates, 1);
  assert.equal(row.cleanupPreview.executionDryRuns[0].conflicts.existingExcursionTemplateDuplicates, 1);
  assert.equal(row.cleanupPreview.executionDryRuns[0].conflicts.canonicalCodeConflicts, 1);
  assert.equal(row.cleanupPreview.executionDryRuns[0].conflicts.hasConflicts, true);
  assert.ok(row.cleanupPreview.executionDryRuns[0].safeExecutionScore < 80);
  assert.match(row.warnings.join(' | '), /Production usage detected/);
  assert.match(row.warnings.join(' | '), /Active quote references detected/);
  assert.match(row.warnings.join(' | '), /Active booking references detected/);
});

function createActivityExecutionPrismaMock(routeOrRoutes: any, counts: Record<string, number> = {}) {
  const routes = Array.isArray(routeOrRoutes) ? routeOrRoutes : [routeOrRoutes];
  const countFor = (modelName: string) => async ({ where }: any = {}) => {
    const routeId = where?.touringRouteId || 'none';
    const activeKey =
      where?.quote?.status || where?.booking?.status || where?.active === true || where?.booking?.seriesDeparture ? ':active' : '';
    return counts[`${modelName}:${routeId}${activeKey}`] ?? counts[`${modelName}:${routeId}`] ?? 0;
  };
  const state: any = { activityCreate: null, routeUpdate: null, auditLogCreate: null };
  const tx = {
    activity: {
      create: async ({ data }: any) => {
        state.activityCreate = data;
        return { id: 'activity-created', ...data };
      },
    },
    touringRoute: {
      update: async ({ where, data }: any) => {
        state.routeUpdate = data;
        const route = routes.find((entry: any) => entry.id === where?.id) || routes[0];
        return { ...route, ...data };
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        state.auditLogCreate = data;
        return { id: 'audit-log-created', ...data };
      },
    },
  };

  return {
    state,
    touringRoute: {
      findUnique: async ({ where }: any = {}) => routes.find((entry: any) => entry.id === where?.id) || routes[0],
      findMany: async () => routes,
      count: countFor('touringRoute'),
    },
    quoteItem: { count: countFor('quoteItem') },
    excursionTemplateComponent: { count: countFor('excursionTemplateComponent') },
    packageTemplateComponent: { count: countFor('packageTemplateComponent') },
    bookingService: { count: countFor('bookingService') },
    activity: {
      count: countFor('activity'),
      findMany: async () => [],
      findFirst: async () => null,
    },
    excursionTemplate: { count: countFor('excursionTemplate') },
    $transaction: async (callback: any) => callback(tx),
  };
}

test('activity master execution converts one low-risk Aqaba candidate and preserves touring history', async () => {
  const route = {
    id: 'aqaba-glass-boat',
    code: 'AQB-GLASS',
    name: 'Aqaba Glass Boat Experience',
    startCity: 'Aqaba',
    durationDays: 1,
    routeDescription: 'Aqaba glass boat activity',
    region: 'Aqaba',
    active: true,
    mainDestinations: ['Aqaba Marina'],
    reviewNotes: 'legacy note',
    stops: [{ order: 1, city: 'Aqaba', location: 'Aqaba Marina' }],
    pricings: [],
  };
  const prisma = createActivityExecutionPrismaMock(route);
  const service = new TouringRoutesService(prisma as any);

  const result = (await service.executeConvertToActivityMaster(
    route.id,
    {
      dryRunAction: 'executeConvertToActivityMasterDryRun',
      dryRunConfirmed: true,
      confirmationText: 'I understand this affects operational taxonomy',
    },
    { id: 'user-1', email: 'ops@example.com', role: 'admin', firstName: 'Ops', lastName: 'User', name: 'Ops User', auditLabel: 'Ops User', companyId: 'company-1' },
  )) as any;

  assert.equal(result.action, 'executeConvertToActivityMaster');
  assert.equal(result.supportedRecommendation, 'MOVE_TO_ACTIVITY_MASTER');
  assert.equal(result.activity.code, 'JOR-ACT-AQABA-AQABA-GLASS-BOAT-EXPERIENCE');
  assert.equal(result.touringRoute.active, false);
  assert.equal(result.touringRoute.hiddenFromSelectors, true);
  assert.equal(prisma.state.activityCreate.supplierCompanyId, 'company-1');
  assert.equal(prisma.state.activityCreate.pricingBasis, 'PER_GROUP');
  assert.match(prisma.state.routeUpdate.reviewNotes, /Original touring route archived and hidden from selectors/);
  assert.equal(prisma.state.auditLogCreate.action, 'touring_route.convert_to_activity_master');
  assert.equal(prisma.state.auditLogCreate.metadata.deletesOriginalTouringRoute, false);
  assert.equal(prisma.state.auditLogCreate.metadata.archivedOriginalTouringRoute, true);
});

test('aqaba activity cleanup dry-run lists only safe activity candidates without mutations', async () => {
  const routes = [
    {
      id: 'aqaba-glass-boat',
      code: 'AQB-GLASS',
      name: 'Aqaba Glass Boat Experience',
      startCity: 'Aqaba',
      durationDays: 1,
      routeDescription: 'Aqaba glass boat activity',
      region: 'Aqaba',
      active: true,
      mainDestinations: ['Aqaba Marina'],
      stops: [{ order: 1, city: 'Aqaba', location: 'Aqaba Marina' }],
      pricings: [],
    },
    {
      id: 'petra-day',
      code: 'PETRA-FD',
      name: 'Petra Full Day Tour',
      startCity: 'Amman',
      durationDays: 1,
      region: 'South',
      active: true,
      mainDestinations: ['Petra'],
      stops: [{ order: 1, city: 'Petra' }],
      pricings: [],
    },
  ];
  const service = new TouringRoutesService(createAuditPrismaMock(routes) as any);

  const dryRun = (await service.dryRunAqabaActivityCleanup()) as any;

  assert.equal(dryRun.mode, 'DRY_RUN');
  assert.equal(dryRun.mutatesData, false);
  assert.equal(dryRun.deletesData, false);
  assert.equal(dryRun.totalCandidates, 1);
  assert.equal(dryRun.candidates[0].touringRouteId, 'aqaba-glass-boat');
  assert.equal(dryRun.candidates[0].proposedActivity.code, 'JOR-ACT-AQABA-AQABA-GLASS-BOAT-EXPERIENCE');
  assert.equal(dryRun.candidates[0].existingDuplicateActivityCheck.duplicateCount, 0);
  assert.deepEqual(dryRun.candidates[0].quoteReferences, { total: 0, active: 0 });
  assert.deepEqual(dryRun.candidates[0].bookingReferences, { total: 0, active: 0 });
  assert.equal(dryRun.candidates[0].safeToConvert, true);
});

test('aqaba activity cleanup dry-run blocks duplicate and referenced rows', async () => {
  const route = {
    id: 'aqaba-yacht',
    code: 'AQB-YACHT',
    name: 'Aqaba Yacht Experience',
    startCity: 'Aqaba',
    durationDays: 1,
    routeDescription: 'Aqaba yacht activity',
    region: 'Aqaba',
    active: true,
    mainDestinations: ['Aqaba Marina'],
    stops: [{ order: 1, city: 'Aqaba', location: 'Aqaba Marina' }],
    pricings: [],
  };
  const prisma = createAuditPrismaMock([route], {
    'quoteItem:aqaba-yacht': 1,
    'quoteItem:aqaba-yacht:active': 1,
    'activity:none': 1,
  }) as any;
  prisma.activity.findMany = async () => [{ id: 'activity-1', code: 'JOR-ACT-AQABA-AQABA-YACHT-EXPERIENCE', name: 'Aqaba Yacht Experience', active: true }];
  const service = new TouringRoutesService(prisma);

  const dryRun = (await service.dryRunAqabaActivityCleanup()) as any;

  assert.equal(dryRun.totalCandidates, 1);
  assert.equal(dryRun.candidates[0].safeToConvert, false);
  assert.match(dryRun.candidates[0].blockingReasons.join('\n'), /Duplicate Activity Master record already exists/);
  assert.match(dryRun.candidates[0].blockingReasons.join('\n'), /Quote references exist/);
});

test('aqaba activity cleanup apply requires an exact safe route id and company id', async () => {
  const route = {
    id: 'petra-day',
    code: 'PETRA-FD',
    name: 'Petra Full Day Tour',
    startCity: 'Amman',
    durationDays: 1,
    region: 'South',
    active: true,
    mainDestinations: ['Petra'],
    stops: [{ order: 1, city: 'Petra' }],
    pricings: [],
  };
  const service = new TouringRoutesService(createAuditPrismaMock([route]) as any);

  await assert.rejects(() => service.applyAqabaActivityCleanup('', { companyId: 'company-1' }), /requires --id/);
  await assert.rejects(() => service.applyAqabaActivityCleanup('petra-day', { companyId: '' }), /DMC_CLEANUP_COMPANY_ID/);
  await assert.rejects(() => service.applyAqabaActivityCleanup('petra-day', { companyId: 'company-1' }), /Only Aqaba activity-like Touring Routes/);
});

test('aqaba activity batch dry-run evaluates only allowed legacy codes and blocks movement-style rows', async () => {
  const routes = [
    {
      id: 'aq-boat',
      code: 'AQ_BOAT',
      name: 'Aqaba Boat Experience',
      startCity: 'Aqaba',
      durationDays: 1,
      region: 'Aqaba',
      active: true,
      mainDestinations: ['Aqaba Marina'],
      stops: [],
      pricings: [],
    },
    {
      id: 'aq-yacht-rt',
      code: 'AQ_YACHT',
      name: 'Aqaba Yacht RT Transfer',
      startCity: 'Aqaba',
      durationDays: 1,
      region: 'Aqaba',
      active: true,
      mainDestinations: ['Aqaba Marina'],
      stops: [],
      pricings: [],
    },
    {
      id: 'aq-glass',
      code: 'AQ_GLASS',
      name: 'Aqaba Glass Boat Experience',
      startCity: 'Aqaba',
      durationDays: 1,
      region: 'Aqaba',
      active: true,
      mainDestinations: ['Aqaba Marina'],
      stops: [],
      pricings: [],
    },
    {
      id: 'aqaba-rt',
      code: 'JOR-TR-AQABA-BOAT-RT',
      name: 'Aqaba Boat RT',
      startCity: 'Aqaba',
      durationDays: 1,
      region: 'Aqaba',
      active: true,
      mainDestinations: ['Aqaba Marina'],
      stops: [],
      pricings: [],
    },
  ];
  const service = new TouringRoutesService(createAuditPrismaMock(routes) as any);

  const dryRun = (await service.dryRunAqabaActivityCleanupBatch()) as any;
  const byCode = new Map(dryRun.candidates.map((entry: any) => [entry.code, entry]));

  assert.equal(dryRun.mode, 'BATCH_DRY_RUN');
  assert.equal(dryRun.mutatesData, false);
  assert.deepEqual(dryRun.allowedCodes, ['AQ_BOAT', 'AQ_YACHT', 'AQ_DIVE', 'AQ_SNORK', 'AQ_BEACH', 'AQ_SUB']);
  assert.equal(byCode.has('AQ_BOAT'), true);
  assert.equal(byCode.has('AQ_YACHT'), true);
  assert.equal(byCode.has('AQ_GLASS'), false);
  assert.equal(byCode.has('JOR-TR-AQABA-BOAT-RT'), false);
  assert.equal((byCode.get('AQ_BOAT') as any).safeToConvert, true);
  assert.equal((byCode.get('AQ_YACHT') as any).safeToConvert, false);
  assert.match((byCode.get('AQ_YACHT') as any).blockingReasons.join('\n'), /Round-trip or movement-style/);
});

test('aqaba activity batch apply requires confirmation and converts only safe allowed rows', async () => {
  const routes = [
    {
      id: 'aq-boat',
      code: 'AQ_BOAT',
      name: 'Aqaba Boat Experience',
      startCity: 'Aqaba',
      durationDays: 1,
      routeDescription: 'Aqaba boat activity',
      region: 'Aqaba',
      active: true,
      mainDestinations: ['Aqaba Marina'],
      stops: [],
      pricings: [],
    },
    {
      id: 'aq-snork-archived',
      code: 'AQ_SNORK',
      name: 'Aqaba Snorkeling Experience',
      startCity: 'Aqaba',
      durationDays: 1,
      routeDescription: 'Aqaba snorkeling activity',
      region: 'Aqaba',
      active: false,
      mainDestinations: ['Aqaba South Beach'],
      stops: [],
      pricings: [],
    },
    {
      id: 'aq-yacht-blocked',
      code: 'AQ_YACHT',
      name: 'Aqaba Yacht Experience',
      startCity: 'Aqaba',
      durationDays: 1,
      routeDescription: 'Aqaba yacht activity',
      region: 'Aqaba',
      active: true,
      mainDestinations: ['Aqaba Marina'],
      stops: [],
      pricings: [],
    },
  ];
  const prisma = createActivityExecutionPrismaMock(routes, {
    'quoteItem:aq-yacht-blocked': 1,
  });
  const service = new TouringRoutesService(prisma as any);

  await assert.rejects(
    () => service.applyAqabaActivityCleanupBatch({ companyId: 'company-1', confirm: 'WRONG' }),
    /AQABA_ACTIVITY_BATCH_CLEANUP/,
  );

  const result = (await service.applyAqabaActivityCleanupBatch({
    companyId: 'company-1',
    confirm: 'AQABA_ACTIVITY_BATCH_CLEANUP',
  })) as any;

  assert.equal(result.counts.converted, 1);
  assert.equal(result.converted[0].code, 'AQ_BOAT');
  assert.equal(result.converted[0].activity.code, 'JOR-ACT-AQABA-AQABA-BOAT-EXPERIENCE');
  assert.equal(result.counts.skipped, 1);
  assert.equal(result.skipped[0].code, 'AQ_SNORK');
  assert.equal(result.counts.blocked, 1);
  assert.equal(result.blocked[0].code, 'AQ_YACHT');
  assert.equal(result.counts.errors, 0);
});

test('aqaba rt cleanup dry-run proposes excursion template with activity and transfer components only for allowed rt codes', async () => {
  const routes = [
    {
      id: 'aqaba-diving-rt',
      code: 'JOR-TR-AQABA-DIVING-RT',
      name: 'Aqaba Diving RT',
      startCity: 'Aqaba',
      durationDays: 1,
      routeDescription: 'Aqaba diving round trip',
      region: 'Aqaba',
      active: true,
      mainDestinations: ['South Beach'],
      stops: [],
      pricings: [],
    },
    {
      id: 'aqaba-glass-rt',
      code: 'JOR-TR-AQABA-GLASS-BOAT-RT',
      name: 'Aqaba Glass Boat RT',
      startCity: 'Aqaba',
      durationDays: 1,
      routeDescription: 'Aqaba glass boat round trip',
      region: 'Aqaba',
      active: true,
      mainDestinations: ['Aqaba Marina'],
      stops: [],
      pricings: [],
    },
    {
      id: 'legacy-aq-yacht',
      code: 'AQ_YACHT',
      name: 'Aqaba Yacht Experience',
      startCity: 'Aqaba',
      durationDays: 1,
      region: 'Aqaba',
      active: true,
      mainDestinations: ['Aqaba Marina'],
      stops: [],
      pricings: [],
    },
    {
      id: 'petra-aqaba-rt',
      code: 'JOR-TR-SOUTH-PETRA-AQABA-RT',
      name: 'Petra Aqaba RT',
      startCity: 'Petra',
      durationDays: 1,
      region: 'South',
      active: true,
      mainDestinations: ['Aqaba'],
      stops: [],
      pricings: [],
    },
  ];
  const prisma = createAuditPrismaMock(routes) as any;
  prisma.touringRoute.findMany = async ({ where }: any = {}) =>
    routes.filter((route) => !where?.code?.in || where.code.in.includes(route.code));
  prisma.activity.findFirst = async ({ where }: any = {}) => {
    if (where?.code?.equals === 'JOR-ACT-SOUTH-SCUBA-DIVING-EXPERIENCE') {
      return { id: 'activity-diving', code: 'JOR-ACT-SOUTH-SCUBA-DIVING-EXPERIENCE', name: 'Scuba Diving Experience', active: true };
    }
    if (where?.name?.equals === 'Discover Scuba Diving') {
      throw new Error('loose/wrong Activity name must not be queried');
    }
    return null;
  };
  prisma.place.findMany = async ({ where }: any = {}) => {
    const terms = JSON.stringify(where || {}).toLowerCase();
    if (terms.includes('aqaba hotel') || terms.includes('aqaba base') || terms.includes('aqaba city') || terms.includes('aqaba')) {
      return [{ id: 'place-aqaba', name: 'Aqaba City', city: 'Aqaba', type: 'CITY', isActive: true }];
    }
    if (terms.includes('south beach') || terms.includes('diving') || terms.includes('dive')) {
      return [{ id: 'place-south-beach', name: 'South Beach Aqaba', city: 'Aqaba', type: 'ATTRACTION', isActive: true }];
    }
    return [];
  };
  prisma.route.findMany = async ({ where }: any = {}) => {
    if (where?.fromPlaceId === 'place-aqaba' && where?.toPlaceId === 'place-south-beach') {
      return [{ id: 'route-out', name: 'Aqaba City to South Beach Aqaba', normalizedKey: 'aqaba-city__south-beach-aqaba', isActive: true }];
    }
    if (where?.fromPlaceId === 'place-south-beach' && where?.toPlaceId === 'place-aqaba') {
      return [{ id: 'route-return', name: 'South Beach Aqaba to Aqaba City', normalizedKey: 'south-beach-aqaba__aqaba-city', isActive: true }];
    }
    return [];
  };
  const service = new TouringRoutesService(prisma);

  const dryRun = (await service.dryRunAqabaRoundTripCleanup()) as any;
  const byCode = new Map(dryRun.candidates.map((entry: any) => [entry.currentCode, entry]));

  assert.equal(dryRun.mode, 'AQABA_RT_DRY_RUN');
  assert.equal(dryRun.mutatesData, false);
  assert.equal(byCode.has('JOR-TR-AQABA-DIVING-RT'), true);
  assert.equal(byCode.has('JOR-TR-AQABA-GLASS-BOAT-RT'), true);
  assert.equal(byCode.has('AQ_YACHT'), false);
  assert.equal(byCode.has('JOR-TR-SOUTH-PETRA-AQABA-RT'), false);
  assert.equal((byCode.get('JOR-TR-AQABA-DIVING-RT') as any).recommendedAction, 'CONVERT_TO_EXCURSION_TEMPLATE_WITH_TRANSFERS');
  assert.deepEqual((byCode.get('JOR-TR-AQABA-DIVING-RT') as any).proposedExcursionTemplate.components, [
    'OUTBOUND_LOCAL_TRANSFER',
    'ACTIVITY_MASTER',
    'RETURN_LOCAL_TRANSFER',
  ]);
  assert.equal((byCode.get('JOR-TR-AQABA-DIVING-RT') as any).expectedActivityMaster.code, 'JOR-ACT-SOUTH-SCUBA-DIVING-EXPERIENCE');
  assert.equal((byCode.get('JOR-TR-AQABA-DIVING-RT') as any).matchedActivityMaster.id, 'activity-diving');
  assert.equal((byCode.get('JOR-TR-AQABA-DIVING-RT') as any).requiredCanonicalPlaces.aqabaBaseExists, true);
  assert.equal((byCode.get('JOR-TR-AQABA-DIVING-RT') as any).requiredTransferRoutes.outboundExists, true);
  assert.equal((byCode.get('JOR-TR-AQABA-GLASS-BOAT-RT') as any).recommendedAction, 'MANUAL_REVIEW');
  assert.match((byCode.get('JOR-TR-AQABA-GLASS-BOAT-RT') as any).missingActivityMasterWarning, /No Activity Master/);
});

test('aqaba rt dependency dry-run and apply create only missing allowlisted places and transfer routes', async () => {
  const places = [
    { id: 'place-aqaba', name: 'Aqaba', city: 'Aqaba', type: 'CITY', isActive: true },
    { id: 'place-south-beach', name: 'Aqaba South Beach', city: 'Aqaba', type: 'ATTRACTION', isActive: true },
  ];
  const routes: any[] = [];
  const prisma = {
    touringRoute: { findMany: async () => [] },
    quoteItem: { count: async () => 0 },
    excursionTemplateComponent: { count: async () => 0 },
    packageTemplateComponent: { count: async () => 0 },
    bookingService: { count: async () => 0 },
    activity: { count: async () => 0, findFirst: async () => null, findMany: async () => [] },
    excursionTemplate: { count: async () => 0 },
    vehicleRate: {
      create: async () => {
        throw new Error('dependency setup must not create pricing/rates');
      },
    },
    transportPricingRule: {
      create: async () => {
        throw new Error('dependency setup must not create pricing rules');
      },
    },
    place: {
      findMany: async ({ where }: any = {}) => {
        const expectedName = where?.name?.equals;
        return places.filter((place) => place.isActive && place.name.toLowerCase() === String(expectedName || '').toLowerCase());
      },
      create: async ({ data }: any) => {
        const existing = places.find((place) => place.name.toLowerCase() === data.name.toLowerCase());
        if (existing) return existing;
        const created = { id: `place-${places.length + 1}`, ...data };
        places.push(created);
        return created;
      },
    },
    route: {
      findMany: async ({ where }: any = {}) => routes.filter((route) => route.normalizedKey === where?.normalizedKey),
      create: async ({ data }: any) => {
        const existing = routes.find((route) => route.normalizedKey === data.normalizedKey);
        if (existing) return existing;
        const created = { id: `route-${routes.length + 1}`, ...data };
        routes.push(created);
        return created;
      },
    },
  };
  const service = new TouringRoutesService(prisma as any);

  const dryRun = (await service.dryRunAqabaRoundTripDependencies()) as any;

  assert.equal(dryRun.mode, 'AQABA_RT_DEPENDENCIES_DRY_RUN');
  assert.equal(dryRun.mutatesData, false);
  assert.equal(dryRun.createsPricing, false);
  assert.equal(dryRun.missingPlaces.length, 3);
  assert.equal(dryRun.missingTransferRoutes.length, 8);
  assert.equal(dryRun.safeToApply, true);
  assert.ok(dryRun.missingTransferRoutes.some((route: any) => route.proposedRouteCode === 'JOR-TRF-AQABA-AQABA-MARINA'));

  await assert.rejects(
    () => service.applyAqabaRoundTripDependencies({ confirm: 'WRONG' }),
    /AQABA_RT_DEPENDENCIES/,
  );

  const applied = (await service.applyAqabaRoundTripDependencies({ confirm: 'AQABA_RT_DEPENDENCIES' })) as any;
  assert.equal(applied.createsPricing, false);
  assert.equal(applied.counts.createdPlaces, 3);
  assert.equal(applied.counts.createdTransferRoutes, 8);
  assert.equal(routes.length, 8);

  const appliedAgain = (await service.applyAqabaRoundTripDependencies({ confirm: 'AQABA_RT_DEPENDENCIES' })) as any;
  assert.equal(appliedAgain.counts.createdPlaces, 0);
  assert.equal(appliedAgain.counts.createdTransferRoutes, 0);
  assert.equal(routes.length, 8);
  assert.equal(places.filter((place) => place.name === 'Aqaba Marina').length, 1);
});

test('aqaba rt excursion conversion dry-run and apply create ordered template components idempotently', async () => {
  const touringRoutes = [
    {
      id: 'aqaba-diving-rt',
      code: 'JOR-TR-AQABA-DIVING-RT',
      name: 'Aqaba Diving RT',
      startCity: 'Aqaba',
      durationDays: 1,
      routeDescription: 'Aqaba diving round trip',
      region: 'Aqaba',
      active: true,
      mainDestinations: ['South Beach'],
      reviewNotes: 'legacy aqaba rt row',
      stops: [],
      pricings: [],
    },
  ];
  const templates: any[] = [];
  const state: any = { templateCreate: null, routeUpdate: null, auditLogCreate: null };
  const prisma = {
    touringRoute: {
      findMany: async ({ where }: any = {}) => touringRoutes.filter((route) => !where?.code?.in || where.code.in.includes(route.code)),
      findUnique: async ({ where }: any = {}) => touringRoutes.find((route) => route.id === where?.id),
    },
    quoteItem: { count: async () => 0 },
    excursionTemplateComponent: { count: async () => 0 },
    packageTemplateComponent: { count: async () => 0 },
    bookingService: { count: async () => 0 },
    activity: {
      count: async () => 0,
      findFirst: async ({ where }: any = {}) =>
        where?.code?.equals === 'JOR-ACT-SOUTH-SCUBA-DIVING-EXPERIENCE'
          ? { id: 'activity-diving', code: 'JOR-ACT-SOUTH-SCUBA-DIVING-EXPERIENCE', name: 'Scuba Diving Experience', active: true }
          : null,
      findMany: async () => [],
    },
    excursionTemplate: {
      count: async () => 0,
      findFirst: async ({ where }: any = {}) => {
        const code = where?.OR?.find((entry: any) => entry?.code)?.code?.equals;
        const name = where?.OR?.find((entry: any) => entry?.name)?.name?.equals;
        return templates.find((template) => template.code === code || template.name === name) || null;
      },
    },
    place: {
      findMany: async ({ where }: any = {}) => {
        const text = JSON.stringify(where || {}).toLowerCase();
        if (text.includes('aqaba hotel') || text.includes('aqaba base') || text.includes('aqaba city') || text.includes('aqaba')) {
          return [{ id: 'place-aqaba', name: 'Aqaba', city: 'Aqaba', type: 'CITY', isActive: true }];
        }
        if (text.includes('south beach') || text.includes('diving') || text.includes('dive')) {
          return [{ id: 'place-south-beach', name: 'Aqaba South Beach', city: 'Aqaba', type: 'ATTRACTION', isActive: true }];
        }
        return [];
      },
    },
    route: {
      findMany: async ({ where }: any = {}) => {
        if (where?.fromPlaceId === 'place-aqaba' && where?.toPlaceId === 'place-south-beach') {
          return [{ id: 'route-out', name: 'Aqaba to Aqaba South Beach', normalizedKey: 'aqaba_aqaba_south_beach', routeType: 'TRANSFER_ROUTE', isActive: true }];
        }
        if (where?.fromPlaceId === 'place-south-beach' && where?.toPlaceId === 'place-aqaba') {
          return [{ id: 'route-return', name: 'Aqaba South Beach to Aqaba', normalizedKey: 'aqaba_south_beach_aqaba', routeType: 'TRANSFER_ROUTE', isActive: true }];
        }
        return [];
      },
    },
    vehicleRate: {
      create: async () => {
        throw new Error('conversion must not create pricing/rates');
      },
    },
    transportPricingRule: {
      create: async () => {
        throw new Error('conversion must not create pricing rules');
      },
    },
    $transaction: async (callback: any) =>
      callback({
        excursionTemplate: {
          create: async ({ data }: any) => {
            state.templateCreate = data;
            const created = {
              id: 'template-diving',
              code: data.code,
              name: data.name,
              active: data.active,
              components: data.components.create.map((component: any, index: number) => ({ id: `component-${index + 1}`, ...component })),
            };
            templates.push(created);
            return created;
          },
        },
        touringRoute: {
          update: async ({ where, data }: any) => {
            state.routeUpdate = data;
            const route = touringRoutes.find((entry) => entry.id === where.id) as any;
            Object.assign(route, data);
            return route;
          },
        },
        auditLog: {
          create: async ({ data }: any) => {
            state.auditLogCreate = data;
            return { id: 'audit-log', ...data };
          },
        },
      }),
  };
  const service = new TouringRoutesService(prisma as any);

  const dryRun = (await service.dryRunAqabaRoundTripExcursionConversion()) as any;
  const candidate = dryRun.candidates.find((entry: any) => entry.currentCode === 'JOR-TR-AQABA-DIVING-RT');

  assert.equal(dryRun.mode, 'AQABA_RT_EXCURSION_CONVERSION_DRY_RUN');
  assert.equal(dryRun.mutatesData, false);
  assert.equal(dryRun.createsPricing, false);
  assert.equal(candidate.outboundTransferRouteId, 'route-out');
  assert.equal(candidate.activityMasterId, 'activity-diving');
  assert.equal(candidate.returnTransferRouteId, 'route-return');
  assert.equal(candidate.duplicateExcursionTemplateCheck.duplicateFound, false);
  assert.equal(candidate.safeToConvert, true);

  await assert.rejects(
    () => service.applyAqabaRoundTripExcursionConversion({ companyId: 'company-1', confirm: 'WRONG' }),
    /AQABA_RT_EXCURSION_CONVERSION/,
  );

  const applied = (await service.applyAqabaRoundTripExcursionConversion({
    companyId: 'company-1',
    confirm: 'AQABA_RT_EXCURSION_CONVERSION',
  })) as any;

  assert.equal(applied.counts.converted, 1);
  assert.equal(applied.converted[0].excursionTemplate.componentCount, 3);
  assert.equal(state.templateCreate.components.create[0].componentType, 'TRANSPORT');
  assert.equal(state.templateCreate.components.create[0].routeId, 'route-out');
  assert.equal(state.templateCreate.components.create[1].componentType, 'ACTIVITY');
  assert.equal(state.templateCreate.components.create[1].activityId, 'activity-diving');
  assert.equal(state.templateCreate.components.create[2].componentType, 'TRANSPORT');
  assert.equal(state.templateCreate.components.create[2].routeId, 'route-return');
  assert.equal(state.routeUpdate.active, false);
  assert.match(state.routeUpdate.reviewNotes, /Converted to Excursion Template/);
  assert.equal(state.auditLogCreate.action, 'touring_route.aqaba_rt.convert_to_excursion_template');
  assert.equal(state.auditLogCreate.metadata.createsPricing, false);

  const appliedAgain = (await service.applyAqabaRoundTripExcursionConversion({
    companyId: 'company-1',
    confirm: 'AQABA_RT_EXCURSION_CONVERSION',
  })) as any;
  assert.equal(appliedAgain.counts.converted, 0);
  assert.equal(appliedAgain.counts.skipped, 1);
  assert.equal(templates.length, 1);
});

test('activity master execution is blocked when active booking conflicts exist', async () => {
  const route = {
    id: 'aqaba-boat-active-booking',
    code: 'AQB-BOAT',
    name: 'Aqaba Boat Experience',
    startCity: 'Aqaba',
    durationDays: 1,
    routeDescription: 'Aqaba glass boat activity',
    region: 'Aqaba',
    active: true,
    mainDestinations: ['Aqaba Marina'],
    stops: [],
    pricings: [],
  };
  const prisma = createActivityExecutionPrismaMock(route, {
    'bookingService:aqaba-boat-active-booking': 1,
    'bookingService:aqaba-boat-active-booking:active': 1,
  });
  const service = new TouringRoutesService(prisma as any);

  await assert.rejects(
    () =>
      service.executeConvertToActivityMaster(
        route.id,
        {
          dryRunAction: 'executeConvertToActivityMasterDryRun',
          dryRunConfirmed: true,
          confirmationText: 'I understand this affects operational taxonomy',
        },
        { id: 'user-1', email: 'ops@example.com', role: 'admin', firstName: 'Ops', lastName: 'User', name: 'Ops User', auditLabel: 'Ops User', companyId: 'company-1' },
      ),
    /safe execution score|active booking conflicts/,
  );
});
}
