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

function createAuditPrismaMock(routes: any[]) {
  return {
    touringRoute: {
      findMany: async () => routes,
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
}
