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
  assert.equal(byId.get('tour-true').selectorEligible, true);
  assert.deepEqual(byId.get('tour-true').legacyAliases, ['JOR-TR-001']);
  assert.equal(byId.get('tour-true').suggestedCanonicalCode, 'JOR-TR-SOUTH-AMMAN-MADABA-NEBO-PETRA-OVERNIGHT');
  assert.equal(byId.get('tour-true').safeFields.operationalType, 'ROUTING_SKELETON');
  assert.equal(byId.get('tour-true').safeFields.overnight, true);
  assert.equal(byId.get('tour-true').safeFields.guideRequired, true);

  assert.equal(byId.get('aqaba-activity').classification, 'ACTIVITY_CANDIDATE');
  assert.equal(byId.get('aqaba-activity').candidateTarget, 'ACTIVITY');
  assert.equal(byId.get('aqaba-activity').selectorEligible, false);

  assert.equal(byId.get('simple-day-tour').classification, 'EXCURSION_TEMPLATE_CANDIDATE');
  assert.equal(byId.get('simple-day-tour').candidateTarget, 'EXCURSION_TEMPLATE');
  assert.equal(byId.get('simple-day-tour').selectorEligible, false);

  assert.equal(byId.get('one-way-transfer').classification, 'TRANSFER_ROUTE_CANDIDATE');
  assert.equal(byId.get('one-way-transfer').candidateTarget, 'OPERATIONAL_TRANSFER');
  assert.equal(byId.get('one-way-transfer').selectorEligible, false);
  assert.equal(audit.counts.selectorEligible, 1);
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
  assert.equal(rows[0]['Legacy Aliases'], 'JOR-TR-001');
});
}
