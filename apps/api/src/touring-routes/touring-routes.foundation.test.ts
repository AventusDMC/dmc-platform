import test = require('node:test');
import assert = require('node:assert/strict');
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS = require('exceljs');
import * as XLSX from 'xlsx';
import { TouringRoutesService } from './touring-routes.service';
import { seedGoldenJordanTouringRoutes } from '../../prisma/seeds/seed-touring-routes';

const schemaSource = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
const controllerSource = readFileSync(join(__dirname, 'touring-routes.controller.ts'), 'utf8');
const serviceSource = readFileSync(join(__dirname, 'touring-routes.service.ts'), 'utf8');
const seedSource = readFileSync(join(__dirname, '..', '..', 'prisma', 'seeds', 'seed-touring-routes.ts'), 'utf8');
const packageSource = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');

test('touring route foundation defines separate inventory, stops, pricing, and transport classification', () => {
  assert.match(schemaSource, /model TouringRoute\s+\{/);
  assert.match(schemaSource, /model TouringRouteStop\s+\{/);
  assert.match(schemaSource, /model TouringRoutePricing\s+\{/);
  assert.match(schemaSource, /TOURING_ROUTE/);
  assert.match(schemaSource, /includedKm\s+Float\?/);
  assert.match(schemaSource, /includedHours\s+Float\?/);
  assert.match(schemaSource, /estimatedDistanceKm\s+Float\?/);
  assert.match(schemaSource, /estimatedDriveHours\s+Float\?/);
  assert.match(schemaSource, /region\s+String\?/);
  assert.match(schemaSource, /sicPossible\s+Boolean\s+@default\(false\)/);
  assert.match(schemaSource, /overnightRisk\s+Boolean\s+@default\(false\)/);
  assert.match(schemaSource, /extraKmRate\s+Float\?/);
  assert.match(schemaSource, /extraHourRate\s+Float\?/);
});

test('touring route API exposes reusable catalog without using transfer routes', () => {
  assert.match(controllerSource, /@Controller\('touring-routes'\)/);
  assert.match(controllerSource, /@Get\(\)/);
  assert.match(controllerSource, /@Post\(\)/);
  assert.match(serviceSource, /touringRoute\.findMany/);
  assert.match(serviceSource, /touringRoute\.create/);
  assert.doesNotMatch(serviceSource, /prisma\.route\.create/);
});

test('golden Jordan touring route seed creates canonical operational infrastructure only', () => {
  assert.match(packageSource, /"seed:touring-routes": "ts-node prisma\/seeds\/seed-touring-routes\.ts"/);
  assert.match(seedSource, /new PrismaClient\(\)/);
  assert.match(seedSource, /GOLDEN_JORDAN_TOURING_ROUTES/);
  assert.match(seedSource, /dryRun = !process\.argv\.includes\('--apply'\)/);
  assert.match(seedSource, /seedGoldenJordanTouringRoutes\(prisma, \{ dryRun \}\)/);
  assert.match(seedSource, /touringRoute\.upsert/);
  assert.match(seedSource, /created/);
  assert.match(seedSource, /updated/);
  assert.match(seedSource, /skippedExisting/);
  assert.match(seedSource, /duplicatesFlagged/);
  assert.match(seedSource, /validatedRoutes/);
  assert.match(seedSource, /Amman – Jerash – Amman RT/);
  assert.match(seedSource, /Amman – Madaba – Nebo – Dead Sea – Amman RT/);
  assert.match(seedSource, /Petra – Wadi Rum ON/);
  assert.match(seedSource, /Amman – Blessed Tree – Amman RT/);
  assert.match(seedSource, /estimatedDistanceKm/);
  assert.match(seedSource, /estimatedDriveHours/);
  assert.match(seedSource, /region: 'North'/);
  assert.match(seedSource, /region: 'Central'/);
  assert.match(seedSource, /region: 'South'/);
  assert.match(seedSource, /region: 'Islamic'/);
  assert.match(seedSource, /Golden Jordan canonical touring route\. Operational infrastructure only; not a sellable excursion template\./);
  assert.doesNotMatch(seedSource, /excursionTemplate\.upsert[\s\S]*GOLDEN_JORDAN_TOURING_ROUTES/);
  assert.doesNotMatch(seedSource, /quote\./);
  assert.doesNotMatch(seedSource, /invoice\./);
  assert.doesNotMatch(seedSource, /hotel\./);
  assert.doesNotMatch(seedSource, /booking\./);
});

test('golden Jordan route naming uses touring stop separators and RT ON suffixes', () => {
  const canonicalNames = Array.from(seedSource.matchAll(/name: '([^']+)'/g)).map((match) => match[1]).filter((name) => name.includes('–'));
  assert.ok(canonicalNames.length >= 14);
  assert.ok(canonicalNames.every((name) => name.includes('–')));
  assert.ok(canonicalNames.some((name) => name.endsWith('RT')));
  assert.ok(canonicalNames.some((name) => name.endsWith('ON')));
});

test('golden Jordan touring route expansion is dry-run first and idempotent', async () => {
  const calls: string[] = [];
  const store = {
    touringRoutes: [
      {
        id: 'existing-jerash',
        code: 'JOR-TR-NORTH-JERASH-RT',
        name: 'Amman -> Jerash -> Amman RT',
        routeDescription: 'Amman -> Jerash -> Amman',
        reviewNotes: '',
      },
    ] as any[],
  };
  const prisma = {
    touringRoute: {
      findMany: async ({ where }: any = {}) => {
        if (where?.code?.in) return store.touringRoutes.filter((route) => where.code.in.includes(route.code));
        if (where?.code?.notIn) return store.touringRoutes.filter((route) => !where.code.notIn.includes(route.code));
        return store.touringRoutes;
      },
      upsert: async ({ where, create, update }: any) => {
        calls.push(`upsert:${where.code}`);
        const existing = store.touringRoutes.find((route) => route.code === where.code);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = { id: `route-${store.touringRoutes.length + 1}`, ...create };
        store.touringRoutes.push(created);
        return created;
      },
      update: async ({ where, data }: any) => {
        calls.push(`update:${where.id}`);
        Object.assign(store.touringRoutes.find((route) => route.id === where.id), data);
      },
      count: async ({ where }: any = {}) => store.touringRoutes.filter((route) => where?.code?.in.includes(route.code)).length,
    },
  };
  const logger = { log: () => undefined, warn: () => undefined };

  const dryRunSummary = await seedGoldenJordanTouringRoutes(prisma as any, { logger });
  assert.equal(dryRunSummary.dryRun, true);
  assert.equal(dryRunSummary.skippedExisting, 1);
  assert.ok(dryRunSummary.created >= 30);
  assert.deepEqual(calls, []);
  assert.equal(store.touringRoutes.length, 1);

  const applySummary = await seedGoldenJordanTouringRoutes(prisma as any, { dryRun: false, logger });
  assert.equal(applySummary.dryRun, false);
  assert.equal(applySummary.updated, 1);
  assert.ok(applySummary.created >= 30);
  assert.equal(applySummary.validatedRoutes, applySummary.totalCanonicalRoutes);
  assert.ok(calls.some((call) => call === 'upsert:JOR-TR-NORTH-JERASH-RT'));
  assert.ok(store.touringRoutes.some((route) => route.code === 'JOR-TR-AQABA-DIVING-RT'));
  assert.ok(store.touringRoutes.some((route) => route.code === 'JOR-TR-LAYOVER-QAIA-JERASH-RT'));
  const petraOn = store.touringRoutes.find((route) => route.code === 'JOR-TR-SOUTH-AMMAN-PETRA-ON');
  assert.match(petraOn.reviewNotes, /Pickup recommendation:/);
  assert.match(petraOn.reviewNotes, /Stationary \/ Waiting guidance:/);
  assert.match(petraOn.reviewNotes, /Overnight marker:/);
  assert.ok(petraOn.stops.create.some((stop: any) => /Overnight stop/.test(stop.notes || '')));
});

function buildTouringWorkbookBuffer(rows: {
  routes: Array<Record<string, unknown>>;
  stops: Array<Record<string, unknown>>;
  rates: Array<Record<string, unknown>>;
  vehicleTypes?: Array<Record<string, unknown>>;
}) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.routes), 'TOURING_ROUTES');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.stops), 'TOURING_ROUTE_STOPS');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.rates), 'TOURING_ROUTE_RATES');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.vehicleTypes || [{ VehicleType: 'Sedan' }]), 'VEHICLE_TYPES');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

function buildTouringMatrixWorkbookBuffer(rows: Record<string, unknown>[], sheetName = 'TOURING_ROUTE_MATRIX') {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), sheetName);
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

function buildTouringMatrixWithPlaceholderNormalizedTabsBuffer(rows: Record<string, unknown>[]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ TourCode: '', TourName: '', StartCity: '' }]), 'TOURING_ROUTES');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ TourCode: '', StopOrder: '', City: '' }]), 'TOURING_ROUTE_STOPS');
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ TourCode: '', SupplierName: '', VehicleType: '', PaxFrom: '', PaxTo: '', Currency: '', BaseCost: '' }]),
    'TOURING_ROUTE_RATES',
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ VehicleType: '' }]), 'VEHICLE_TYPES');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'TRANSPORT_MATRIX');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

async function buildExcelJsTouringWorkbookBuffer(rowCount = 3) {
  const workbook = new ExcelJS.Workbook();
  const routeSheet = workbook.addWorksheet('TOURING_ROUTES');
  routeSheet.addRow(['TourCode', 'TourName', 'StartCity', 'DurationDays', 'IncludedKM', 'IncludedHours']);
  const stopSheet = workbook.addWorksheet('TOURING_ROUTE_STOPS');
  stopSheet.addRow(['TourCode', 'StopOrder', 'City']);
  const rateSheet = workbook.addWorksheet('TOURING_ROUTE_RATES');
  rateSheet.addRow(['TourCode', 'SupplierName', 'VehicleType', 'PaxFrom', 'PaxTo', 'Currency', 'BaseCost', 'ValidFrom', 'ValidTo']);
  const vehicleSheet = workbook.addWorksheet('VEHICLE_TYPES');
  vehicleSheet.addRow(['VehicleType']);
  vehicleSheet.addRow(['Sedan']);

  for (let index = 1; index <= rowCount; index += 1) {
    const code = `TOUR-${index}`;
    routeSheet.addRow([code, `Touring Route ${index}`, 'Amman', 1, 120 + index, 8]);
    stopSheet.addRow([code, 1, 'Amman']);
    rateSheet.addRow([code, 'Alpha Transport', 'Sedan', 1, 3, 'USD', 100 + index, '2026-01-01', '2026-12-31']);
  }

  return Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
}

function createTouringPrismaMock() {
  const stores = {
    suppliers: [{ id: 'supplier-1', name: 'Alpha Transport', type: 'transport' }],
    vehicles: [
      { id: 'vehicle-1', name: 'Sedan 3', vehicleType: 'Sedan', minPax: 1, maxPax: 2 },
      { id: 'vehicle-2', name: 'Van 6', vehicleType: 'Van', minPax: 3, maxPax: 6 },
      { id: 'vehicle-3', name: 'Coaster 20', vehicleType: 'Coaster', minPax: 7, maxPax: 20 },
      { id: 'vehicle-4', name: 'Mini Bus 20', vehicleType: 'Mini Bus', minPax: 7, maxPax: 20 },
    ],
    routes: [] as any[],
    stops: [] as any[],
    pricings: [] as any[],
    transportRules: [] as any[],
  };
  const prisma = {
    supplier: {
      findMany: async () => stores.suppliers,
    },
    vehicle: {
      findMany: async () => stores.vehicles,
    },
    touringRoute: {
      findMany: async ({ where }: any = {}) => {
        const codes = where?.code?.in;
        return codes ? stores.routes.filter((route) => codes.includes(route.code)) : stores.routes;
      },
      findUnique: async ({ where }: any) => stores.routes.find((route) => route.id === where.id) || null,
      create: async ({ data }: any) => {
        const { stops, pricings, ...routeData } = data;
        const route = { id: `tour-${stores.routes.length + 1}`, ...routeData };
        stores.routes.push(route);
        const createdStops = (stops?.create || []).map((entry: any, index: number) => ({
          id: `stop-${stores.stops.length + index + 1}`,
          touringRouteId: route.id,
          ...entry,
        }));
        stores.stops.push(...createdStops);
        return { ...route, stops: createdStops, pricings: [] };
      },
      update: async ({ where, data }: any) => {
        const route = stores.routes.find((entry) => entry.id === where.id);
        Object.assign(route, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
        return route;
      },
    },
    touringRouteStop: {
      deleteMany: async ({ where }: any) => {
        stores.stops = stores.stops.filter((stop) => stop.touringRouteId !== where.touringRouteId);
      },
      createMany: async ({ data }: any) => {
        stores.stops.push(...data.map((entry: any, index: number) => ({ id: `stop-${stores.stops.length + index + 1}`, ...entry })));
      },
    },
    touringRoutePricing: {
      findMany: async ({ where }: any = {}) => {
        const codes = where?.touringRoute?.code?.in;
        return stores.pricings
          .filter((pricing) => !codes || codes.includes(stores.routes.find((route) => route.id === pricing.touringRouteId)?.code))
          .map((pricing) => ({
            ...pricing,
            touringRoute: stores.routes.find((route) => route.id === pricing.touringRouteId),
            supplier: stores.suppliers.find((supplier) => supplier.id === pricing.supplierId),
            vehicle: stores.vehicles.find((vehicle) => vehicle.id === pricing.vehicleId),
          }));
      },
      findFirst: async ({ where }: any = {}) =>
        stores.pricings.find(
          (pricing) =>
            pricing.touringRouteId === where?.touringRouteId &&
            (pricing.supplierId || null) === (where?.supplierId || null) &&
            (pricing.vehicleId || null) === (where?.vehicleId || null) &&
            pricing.pricingBasis === where?.pricingBasis &&
            pricing.minPax === where?.minPax &&
            pricing.maxPax === where?.maxPax &&
            pricing.currency === where?.currency &&
            (pricing.validFrom || null) === (where?.validFrom || null) &&
            (pricing.validTo || null) === (where?.validTo || null),
        ) || null,
      create: async ({ data }: any) => {
        const pricing = { id: `pricing-${stores.pricings.length + 1}`, ...data };
        stores.pricings.push(pricing);
        return pricing;
      },
      update: async ({ where, data }: any) => {
        const pricing = stores.pricings.find((entry) => entry.id === where.id);
        Object.assign(pricing, data);
        return pricing;
      },
    },
    transportPricingRule: {
      findMany: async () =>
        stores.transportRules.map((rule) => ({
          ...rule,
          route: stores.routes.find((route) => route.id === rule.routeId),
          supplier: stores.suppliers.find((supplier) => supplier.id === rule.supplierId),
          vehicle: stores.vehicles.find((vehicle) => vehicle.id === rule.vehicleId),
          transportServiceType: rule.transportServiceType || null,
        })),
    },
    $transaction: async (callback: any) => callback(prisma),
  };
  return { prisma, stores };
}

test('touring workbook preview validates tabs and classifies route and pricing rows', async () => {
  const { prisma } = createTouringPrismaMock();
  const service = new TouringRoutesService(prisma as any);
  const buffer = buildTouringWorkbookBuffer({
    routes: [
      {
        TourCode: 'PETRA-FD',
        TourName: 'Petra Full Day',
        StartCity: 'Amman',
        DurationDays: 1,
        RouteDescription: 'Amman to Petra and return',
        MainDestinations: 'Petra',
        IncludedKM: 480,
        IncludedHours: 12,
        Active: 'Active',
      },
    ],
    stops: [{ TourCode: 'PETRA-FD', StopOrder: 1, City: 'Petra', Location: 'Petra Visitor Center', Notes: 'Main visit' }],
    rates: [
      {
        TourCode: 'PETRA-FD',
        SupplierName: 'Alpha Transport',
        VehicleType: 'Sedan',
        PaxFrom: 1,
        PaxTo: 3,
        Currency: 'USD',
        BaseCost: 180,
        ValidFrom: '2026-01-01',
        ValidTo: '2026-12-31',
      },
    ],
  });

  const preview = (await service.previewWorkbookImport({ buffer, originalname: 'touring.xlsx' })) as any;
  assert.equal(preview.success, true);
  assert.equal(preview.importer, 'NORMALIZED_TOURING_ROUTE_WORKBOOK');
  assert.equal(preview.workbookMode, 'Normalized Workbook Mode');
  assert.equal(preview.routeCount, 1);
  assert.equal(preview.stopCount, 1);
  assert.equal(preview.pricingCount, 1);
  assert.equal(preview.routes[0].importDecision, 'NEW');
  assert.equal(preview.pricings[0].importDecision, 'NEW');
  assert.deepEqual(preview.errors, []);
});

test('touring workbook preview accepts VariantCode for stop and rate route references', async () => {
  const { prisma } = createTouringPrismaMock();
  const service = new TouringRoutesService(prisma as any);
  const buffer = buildTouringWorkbookBuffer({
    routes: [
      {
        TourCode: 'PETRA-FD',
        TourName: 'Petra Full Day',
        StartCity: 'Amman',
        DurationDays: 1,
      },
    ],
    stops: [{ VariantCode: 'PETRA-FD', StopOrder: 1, City: 'Petra', Location: 'Petra Visitor Center' }],
    rates: [
      {
        VariantCode: 'PETRA-FD',
        SupplierName: 'Alpha Transport',
        VehicleType: 'Sedan',
        PaxFrom: 1,
        PaxTo: 3,
        Currency: 'USD',
        BaseCost: 180,
        ValidFrom: '2026-01-01',
        ValidTo: '2026-12-31',
      },
    ],
  });

  const preview = (await service.previewWorkbookImport({ buffer, originalname: 'variant-rates.xlsx' })) as any;

  assert.deepEqual(preview.errors, []);
  assert.equal(preview.stopCount, 1);
  assert.equal(preview.pricingCount, 1);
  assert.equal(preview.pricings[0].tourCode, 'PETRA_FD');
});

test('touring workbook preview accepts normalized ERP workbook shape without legacy aliases', async () => {
  const { prisma, stores } = createTouringPrismaMock();
  stores.vehicles.push({ id: 'vehicle-minivan-5', name: 'Mini Van 5', vehicleType: 'Mini Van', maxPax: 5 } as any);
  const service = new TouringRoutesService(prisma as any);
  const buffer = buildTouringWorkbookBuffer({
    routes: [
      {
        TourCode: 'PETRA-FD',
        TourName: 'Petra Full Day',
        StartCity: 'Amman',
        ReturnCity: 'Amman',
        DurationHours: 12,
        MainRoute: 'Amman - Petra - Amman',
        MainDestinations: 'Petra',
        TransportType: 'TOURING_ROUTE',
      },
      {
        TourCode: 'JERASH-HD',
        TourName: 'Jerash Half Day',
        StartCity: 'Amman',
        ReturnCity: 'Amman',
        DurationHours: 5,
        MainRoute: 'Amman - Jerash - Amman',
        MainDestinations: 'Jerash',
        TransportType: 'TOURING_ROUTE',
      },
    ],
    stops: [
      { TourCode: 'PETRA-FD', StopOrder: 1, StopName: 'Petra Visitor Center', StopType: 'VISIT', Region: 'Petra', Overnight: 'No', Notes: 'Main visit' },
      { TourCode: 'JERASH-HD', StopOrder: 1, StopName: 'Jerash Archaeological Site', StopType: 'VISIT', Region: 'Jerash', Overnight: 'No', Notes: '' },
    ],
    rates: [
      {
        SupplierName: 'Alpha Transport',
        TourCode: 'PETRA-FD',
        VehicleCode: 'MINIVAN5',
        VehicleName: 'Mini Van 5',
        PricingBasis: 'PER_VEHICLE',
        Currency: 'USD',
        Cost: 220,
        ValidFrom: '2026-01-01',
        ValidTo: '2026-12-31',
        IncludedHours: 12,
        Notes: 'Normalized ERP rate',
      },
    ],
    vehicleTypes: [{ VehicleCode: 'MINIVAN5', VehicleName: 'Mini Van 5', VehicleCategory: 'Mini Van', MinPax: 1, MaxPax: 5, Notes: 'Do not normalize to Mini Bus' }],
  });

  const preview = (await service.previewWorkbookImport({ buffer, originalname: 'Jordan_Touring_Routes_Complete_Normalized_ERP_Workbook.xlsx' })) as any;

  assert.equal(preview.success, true);
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.routeCount, 2);
  assert.equal(preview.stopCount, 2);
  assert.equal(preview.pricingCount, 1);
  assert.equal(preview.routes[0].durationDays, 1);
  assert.equal(preview.routes[0].routeDescription, 'Amman - Petra - Amman');
  assert.equal(preview.stops[0].city, 'Petra');
  assert.equal(preview.stops[0].location, 'Petra Visitor Center');
  assert.equal(preview.pricings[0].vehicleId, 'vehicle-minivan-5');
  assert.equal(preview.pricings[0].vehicleName, 'Mini Van 5');
  assert.equal(preview.pricings[0].vehicleType, 'Mini Van');
  assert.equal(preview.pricings[0].minPax, 1);
  assert.equal(preview.pricings[0].maxPax, 5);
  assert.equal(preview.pricings[0].baseCost, 220);
  assert.ok(preview.warnings.some((entry: any) => /JERASH_HD has no pricing rows/.test(entry.message)));
  assert.equal(preview.pricings[0].vehicleType === 'Mini Bus', false);
});

test('original normalized touring workbook shape previews successfully without legacy required-column errors', async () => {
  const { prisma, stores } = createTouringPrismaMock();
  stores.vehicles.push({ id: 'vehicle-minivan-5', name: 'Mini Van 5', vehicleType: 'Mini Van', maxPax: 5 } as any);
  const service = new TouringRoutesService(prisma as any);
  const buffer = buildTouringWorkbookBuffer({
    routes: [
      {
        TourCode: 'PETRA-FD',
        TourName: 'Petra Full Day',
        StartCity: 'Amman',
        ReturnCity: 'Amman',
        DurationHours: 12,
        MainRoute: 'Amman - Petra - Amman',
        MainDestinations: 'Petra',
        IncludedKM: 480,
        IncludedHours: 12,
        TransportType: 'TOURING_ROUTE',
      },
    ],
    stops: [{ TourCode: 'PETRA-FD', StopOrder: 1, StopName: 'Petra Visitor Center', StopType: 'VISIT', Region: 'Petra', Overnight: 'No' }],
    rates: [
      {
        SupplierName: 'Alpha Transport',
        TourCode: 'PETRA-FD',
        VehicleCode: 'MINIVAN5',
        VehicleName: 'Mini Van 5',
        PricingBasis: 'PER_VEHICLE',
        Currency: 'USD',
        Cost: 220,
        ValidFrom: '2026-01-01',
        ValidTo: '2026-12-31',
        IncludedHours: 12,
      },
    ],
    vehicleTypes: [{ VehicleCode: 'MINIVAN5', VehicleName: 'Mini Van 5', VehicleCategory: 'Mini Van', MinPax: 1, MaxPax: 5 }],
  });

  const preview = (await service.previewWorkbookImport({ buffer, originalname: 'Jordan_Touring_Routes_Complete_Normalized_ERP_Workbook.xlsx' })) as any;

  assert.equal(preview.success, true);
  assert.deepEqual(preview.errors, []);
  assert.ok(preview.routeCount > 0);
  assert.ok(preview.stopCount > 0);
  assert.ok(preview.pricingCount > 0);
  assert.doesNotMatch(JSON.stringify(preview), /Missing required column|Cost\/BaseCost\/BasePrice|VehicleType/);
});

test('touring workbook preview accepts ExcelJS normalized four-sheet workbook without legacy column errors', async () => {
  const { prisma, stores } = createTouringPrismaMock();
  stores.suppliers.push({ id: 'supplier-review', name: 'REVIEW_SUPPLIER', type: 'transport' } as any);
  stores.vehicles.push({ id: 'vehicle-van-9', name: 'Van 9', vehicleType: 'Van', maxPax: 9 } as any);
  const service = new TouringRoutesService(prisma as any);
  const workbook = new ExcelJS.Workbook();

  const routeSheet = workbook.addWorksheet('TOURING_ROUTES');
  routeSheet.addRow([
    'TourCode',
    'TourName',
    'StartCity',
    'DurationDays',
    'RouteDescription',
    'MainDestinations',
    'IncludedKM',
    'IncludedHours',
    'TransportType',
    'Notes',
  ]);
  routeSheet.addRow(['PETRA_FD_TEST', 'Petra Full Day Test', 'Amman', 1, 'Amman → Petra → Amman', 'Petra', 600, 12, 'TOURING_ROUTE', 'Tiny ExcelJS test']);

  const stopSheet = workbook.addWorksheet('TOURING_ROUTE_STOPS');
  stopSheet.addRow(['TourCode', 'StopOrder', 'StopName', 'Region', 'Overnight', 'Notes']);
  stopSheet.addRow(['PETRA_FD_TEST', 1, 'Amman', 'Amman', false, 'Departure']);
  stopSheet.addRow(['PETRA_FD_TEST', 2, 'Petra', 'South Jordan', false, 'Visit']);
  stopSheet.addRow(['PETRA_FD_TEST', 3, 'Amman', 'Amman', false, 'Return']);

  const rateSheet = workbook.addWorksheet('TOURING_ROUTE_RATES');
  rateSheet.addRow([
    'SupplierName',
    'TourCode',
    'VehicleCode',
    'VehicleName',
    'PricingBasis',
    'Currency',
    'Cost',
    'ValidFrom',
    'ValidTo',
    'IncludedKM',
    'IncludedHours',
    'ExtraKMRate',
    'ExtraHourRate',
    'DriverAccommodationIncluded',
    'Notes',
  ]);
  rateSheet.addRow(['REVIEW_SUPPLIER', 'PETRA_FD_TEST', 'VAN9', 'Van 9', 'PER_VEHICLE', 'JOD', 140, '2026-01-01', '2026-12-31', 600, 12, 0.5, 10, false, 'ExcelJS tiny test']);

  const vehicleSheet = workbook.addWorksheet('VEHICLE_TYPES');
  vehicleSheet.addRow(['VehicleCode', 'VehicleName', 'VehicleCategory', 'MinPax', 'MaxPax', 'LuggageCapacity', 'Notes']);
  vehicleSheet.addRow(['VAN9', 'Van 9', 'Van', 1, 9, 9, 'Touring van']);

  const buffer = Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
  const preview = (await service.previewWorkbookImport({ buffer, originalname: 'Tiny_Touring_Route_Import_Test_EXCELJS.xlsx' })) as any;

  assert.equal(preview.success, true);
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.routeCount, 1);
  assert.equal(preview.stopCount, 3);
  assert.equal(preview.pricingCount, 1);
  assert.equal(preview.stops[0].city, 'Amman');
  assert.equal(preview.stops[1].location, 'Petra');
  assert.equal(preview.pricings[0].vehicleId, 'vehicle-van-9');
  assert.equal(preview.pricings[0].baseCost, 140);
  assert.equal(preview.pricings[0].currency, 'JOD');
});

test('touring workbook preview returns structured errors instead of raw 500 on internal parser failure', async () => {
  const { prisma } = createTouringPrismaMock();
  prisma.supplier.findMany = async () => {
    throw new Error('Simulated supplier lookup failure');
  };
  const service = new TouringRoutesService(prisma as any);
  const buffer = buildTouringWorkbookBuffer({
    routes: [{ TourCode: 'PETRA-FD', TourName: 'Petra Full Day', StartCity: 'Amman', DurationDays: 1 }],
    stops: [{ TourCode: 'PETRA-FD', StopOrder: 1, City: 'Petra' }],
    rates: [{ TourCode: 'PETRA-FD', SupplierName: 'Alpha Transport', VehicleType: 'Sedan', PaxFrom: 1, PaxTo: 3, Currency: 'USD', BaseCost: 180, ValidFrom: '2026-01-01', ValidTo: '2026-12-31' }],
  });

  const preview = (await service.previewWorkbookImport({ buffer, originalname: 'broken-touring.xlsx' })) as any;

  assert.equal(preview.success, false);
  assert.equal(preview.errors[0].stage, 'master inventory lookup');
  assert.match(preview.errors[0].message, /Simulated supplier lookup failure/);
  assert.deepEqual(preview.routes, []);
  assert.deepEqual(preview.pricings, []);
});

test('touring workbook parser has an ExcelJS fallback for modern XLSX compression compatibility', () => {
  assert.match(serviceSource, /import ExcelJS = require\('exceljs'\)/);
  assert.match(serviceSource, /XLSX\.read\(buffer,\s*\{\s*type:\s*'buffer'/);
  assert.match(serviceSource, /readWorkbookWithExcelJs/);
  assert.match(serviceSource, /excelWorkbook\.xlsx\.load\(buffer as any\)/);
});

test('touring workbook preview returns structured decompression validation error', async () => {
  const { prisma } = createTouringPrismaMock();
  const service = new TouringRoutesService(prisma as any);
  const preview = (service as any).buildWorkbookDecompressionFailure(
    { originalname: 'openpyxl-touring.xlsx' },
    new Error('Unsupported ZIP Compression method'),
  ) as any;

  assert.equal(preview.success, false);
  assert.equal(preview.stage, 'workbook decompression');
  assert.equal(preview.message, 'Unsupported workbook compression format');
  assert.equal(preview.sourceFileName, 'openpyxl-touring.xlsx');
  assert.equal(preview.errors[0].stage, 'workbook decompression');
  assert.equal(preview.errors[0].message, 'Unsupported workbook compression format');
});

test('touring workbook preview accepts ExcelJS-generated workbooks with multiple touring rows', async () => {
  const { prisma } = createTouringPrismaMock();
  const service = new TouringRoutesService(prisma as any);
  const buffer = await buildExcelJsTouringWorkbookBuffer(25);

  const preview = await service.previewWorkbookImport({ buffer, originalname: 'exceljs-touring.xlsx' });

  assert.equal(preview.success, true);
  assert.equal(preview.routeCount, 25);
  assert.equal(preview.stopCount, 25);
  assert.equal(preview.pricingCount, 25);
  assert.deepEqual(preview.errors, []);
});

test('touring workbook import creates touring routes stops and pricing without transfer routes', async () => {
  const { prisma, stores } = createTouringPrismaMock();
  const service = new TouringRoutesService(prisma as any);
  const buffer = buildTouringWorkbookBuffer({
    routes: [{ TourCode: 'PETRA-WR-2D', TourName: 'Petra Wadi Rum 2D', StartCity: 'Amman', DurationDays: 2, IncludedKM: 620, IncludedHours: 20 }],
    stops: [
      { TourCode: 'PETRA-WR-2D', StopOrder: 1, City: 'Petra', Location: 'Petra', Overnight: 'No' },
      { TourCode: 'PETRA-WR-2D', StopOrder: 2, City: 'Wadi Rum', Location: 'Wadi Rum Camp', Overnight: 'Yes' },
    ],
    rates: [{ TourCode: 'PETRA-WR-2D', SupplierName: 'Alpha Transport', VehicleType: 'Sedan', PaxFrom: 1, PaxTo: 3, Currency: 'USD', BaseCost: 320, ValidFrom: '2026-01-01', ValidTo: '2026-12-31' }],
  });

  const result = (await service.importWorkbook({ buffer, originalname: 'touring.xlsx' })) as any;
  assert.equal(result.imported.routes, 1);
  assert.equal(result.imported.stops, 2);
  assert.equal(result.imported.pricings, 1);
  assert.equal(stores.routes[0].code, 'PETRA_WR_2D');
  assert.equal(stores.stops.length, 2);
  assert.equal(stores.pricings.length, 1);
});

test('touring workbook import allows unresolved supplier mapping as non-blocking review data', async () => {
  const { prisma, stores } = createTouringPrismaMock();
  const service = new TouringRoutesService(prisma as any);
  const buffer = buildTouringWorkbookBuffer({
    routes: [{ TourCode: 'PETRA-FD', TourName: 'Petra Full Day', StartCity: 'Amman', DurationDays: 1 }],
    stops: [{ TourCode: 'PETRA-FD', StopOrder: 1, City: 'Petra', Location: 'Petra Visitor Center' }],
    rates: [
      {
        TourCode: 'PETRA-FD',
        SupplierName: 'Default Supplier',
        VehicleType: 'Sedan',
        PaxFrom: 1,
        PaxTo: 2,
        Currency: 'JOD',
        BaseCost: 120,
        ValidFrom: '2026-01-01',
        ValidTo: '2026-12-31',
      },
    ],
  });

  const preview = (await service.previewWorkbookImport({ buffer, originalname: 'touring.xlsx' })) as any;

  assert.equal(preview.success, true);
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.pricingCount, 1);
  assert.equal(preview.supplierMapping.missing, 1);
  assert.equal(preview.pricings[0].supplierId, null);
  assert.equal(preview.pricings[0].vehicleId, 'vehicle-1');
  assert.ok(preview.warnings.some((entry: any) => /Supplier mapping missing for Default Supplier/.test(entry.message)));

  const result = (await service.importWorkbook({ buffer, originalname: 'touring.xlsx' })) as any;

  assert.equal(result.imported.pricings, 1);
  assert.equal(stores.pricings.length, 1);
  assert.equal(stores.pricings[0].supplierId, null);
  assert.equal(stores.pricings[0].vehicleId, 'vehicle-1');
  assert.equal(stores.pricings[0].currency, 'JOD');
  assert.equal(stores.pricings[0].baseCost, 120);
  assert.equal(stores.pricings[0].notes, 'SupplierName: Default Supplier');
});

test('touring workbook preview treats missing validity dates as non-blocking warnings', async () => {
  const { prisma } = createTouringPrismaMock();
  const service = new TouringRoutesService(prisma as any);
  const buffer = buildTouringWorkbookBuffer({
    routes: [{ TourCode: 'PETRA-FD', TourName: 'Petra Full Day', StartCity: 'Amman', DurationDays: 1 }],
    stops: [],
    rates: [{ TourCode: 'PETRA-FD', SupplierName: 'Alpha Transport', VehicleType: 'Sedan', PaxFrom: 1, PaxTo: 2, Currency: 'JOD', BaseCost: 95 }],
  });

  const preview = (await service.previewWorkbookImport({ buffer, originalname: 'touring.xlsx' })) as any;

  assert.equal(preview.success, true);
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.pricings[0].validFrom, '');
  assert.equal(preview.pricings[0].validTo, '');
  assert.ok(preview.warnings.some((entry: any) => entry.row === 2 && /ValidFrom is missing/.test(entry.message)));
  assert.ok(preview.warnings.some((entry: any) => entry.row === 2 && /ValidTo is missing/.test(entry.message)));
});

test('touring workbook import creates pricing with nullable validity dates', async () => {
  const { prisma, stores } = createTouringPrismaMock();
  const service = new TouringRoutesService(prisma as any);
  const buffer = buildTouringWorkbookBuffer({
    routes: [{ TourCode: 'PETRA-FD', TourName: 'Petra Full Day', StartCity: 'Amman', DurationDays: 1 }],
    stops: [],
    rates: [{ TourCode: 'PETRA-FD', SupplierName: 'Alpha Transport', VehicleType: 'Sedan', PaxFrom: 1, PaxTo: 2, Currency: 'JOD', BaseCost: 95 }],
  });

  const result = (await service.importWorkbook({ buffer, originalname: 'touring.xlsx' })) as any;

  assert.equal(result.success, true);
  assert.equal(result.imported.pricings, 1);
  assert.equal(stores.pricings[0].validFrom, null);
  assert.equal(stores.pricings[0].validTo, null);
});

test('touring workbook import skips duplicate existing pricing rows without throwing', async () => {
  const { prisma, stores } = createTouringPrismaMock();
  stores.routes.push({ id: 'tour-1', code: 'PETRA_FD', name: 'Petra Full Day', startCity: 'Amman', durationDays: 1 });
  stores.pricings.push({
    id: 'pricing-existing',
    touringRouteId: 'tour-1',
    supplierId: 'supplier-1',
    vehicleId: 'vehicle-1',
    pricingBasis: 'PER_VEHICLE',
    minPax: 1,
    maxPax: 2,
    currency: 'JOD',
    baseCost: 95,
    validFrom: null,
    validTo: null,
  });
  const service = new TouringRoutesService(prisma as any);
  const buffer = buildTouringWorkbookBuffer({
    routes: [{ TourCode: 'PETRA-FD', TourName: 'Petra Full Day', StartCity: 'Amman', DurationDays: 1 }],
    stops: [],
    rates: [{ TourCode: 'PETRA-FD', SupplierName: 'Alpha Transport', VehicleType: 'Sedan', PaxFrom: 1, PaxTo: 2, Currency: 'JOD', BaseCost: 95 }],
  });

  const result = (await service.importWorkbook({ buffer, originalname: 'touring.xlsx' })) as any;

  assert.equal(result.success, true);
  assert.equal(result.imported.pricings, 0);
  assert.equal(result.imported.skippedDuplicates, 1);
  assert.equal(result.imported.skippedRows, 1);
  assert.equal(stores.pricings.length, 1);
  assert.ok(result.skippedRows.some((entry: any) => entry.row === 2 && /duplicate unchanged pricing/.test(entry.message)));
});

test('touring workbook preview accepts QAIA circular layover routes when route and pricing are valid', async () => {
  const { prisma } = createTouringPrismaMock();
  const service = new TouringRoutesService(prisma as any);
  const buffer = buildTouringWorkbookBuffer({
    routes: [
      {
        TourCode: 'QAIA-AMM',
        TourName: 'QAIA Amman Layover',
        StartCity: 'QAIA',
        ReturnCity: 'QAIA',
        DurationHours: 6,
        RouteDescription: 'QAIA -> Amman -> QAIA',
      },
    ],
    stops: [],
    rates: [
      {
        TourCode: 'QAIA-AMM',
        SupplierName: 'Alpha Transport',
        VehicleType: 'Sedan',
        PaxFrom: 1,
        PaxTo: 2,
        Currency: 'JOD',
        BaseCost: 45,
        ValidFrom: '2026-01-01',
        ValidTo: '2026-12-31',
      },
    ],
  });

  const preview = (await service.previewWorkbookImport({ buffer, originalname: 'touring.xlsx' })) as any;

  assert.equal(preview.success, true);
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.routes[0].code, 'QAIA_AMM');
  assert.equal(preview.pricings[0].tourCode, 'QAIA_AMM');
});

test('touring matrix preview normalizes pax range columns into touring route pricing rows without writing', async () => {
  const { prisma, stores } = createTouringPrismaMock();
  stores.routes.push({ id: 'tour-1', code: 'AMM_PET', name: 'Petra Full Day', startCity: 'Amman', durationDays: 1 });
  const service = new TouringRoutesService(prisma as any);
  const buffer = buildTouringMatrixWorkbookBuffer([
    {
      RouteCode: 'AMM-PET',
      SupplierName: 'Alpha Transport',
      Currency: 'JOD',
      ValidFrom: '2026-01-01',
      ValidTo: '2026-12-31',
      '1–2 Pax': 95,
      '3–6 Pax': 140,
      '7–20 Pax': 250,
    },
  ]);

  const preview = (await service.previewWorkbookImport({ buffer, originalname: 'touring-matrix.xlsx' })) as any;

  assert.equal(preview.importer, 'LEGACY_TOURING_ROUTE_MATRIX');
  assert.equal(preview.workbookMode, 'Legacy Matrix Mode');
  assert.equal(preview.pricingCount, 3);
  assert.equal(preview.rowsToCreate[0].minPax, 1);
  assert.equal(preview.rowsToCreate[0].maxPax, 2);
  assert.equal(preview.rowsToCreate[0].baseCost, 95);
  assert.equal(preview.rowsToCreate[1].minPax, 3);
  assert.equal(preview.rowsToCreate[1].maxPax, 6);
  assert.equal(preview.rowsToCreate[1].baseCost, 140);
  assert.equal(preview.rowsToCreate[2].minPax, 7);
  assert.equal(preview.rowsToCreate[2].maxPax, 20);
  assert.equal(preview.rowsToCreate[2].baseCost, 250);
  assert.equal(stores.pricings.length, 0);
});

test('touring matrix preview routes legacy sheet before normalized required-sheet validation', async () => {
  const { prisma, stores } = createTouringPrismaMock();
  stores.routes.push({ id: 'tour-1', code: 'AMM_PET', name: 'Petra Full Day', startCity: 'Amman', durationDays: 1 });
  const service = new TouringRoutesService(prisma as any);
  const buffer = buildTouringMatrixWorkbookBuffer(
    [
      {
        RouteCode: 'AMM-PET',
        SupplierName: 'Alpha Transport',
        Currency: 'JOD',
        '1-2 Pax': 120,
      },
    ],
    'TRANSPORT_MATRIX',
  );

  const preview = (await service.previewWorkbookImport({ buffer, originalname: 'legacy-transport-matrix.xlsx' })) as any;

  assert.equal(preview.success, true);
  assert.equal(preview.importer, 'LEGACY_TOURING_ROUTE_MATRIX');
  assert.equal(preview.workbookMode, 'Legacy Matrix Mode');
  assert.equal(preview.rowsToCreate.length, 1);
  assert.equal(preview.rowsToCreate[0].baseCost, 120);
  assert.deepEqual(preview.errors, []);
});

test('touring matrix preview wins when normalized sheets are placeholder-only', async () => {
  const { prisma, stores } = createTouringPrismaMock();
  stores.routes.push({ id: 'tour-1', code: 'AMM_PET', name: 'Petra Full Day', startCity: 'Amman', durationDays: 1 });
  const service = new TouringRoutesService(prisma as any);
  const buffer = buildTouringMatrixWithPlaceholderNormalizedTabsBuffer([
    {
      RouteCode: 'AMM-PET',
      SupplierName: 'Alpha Transport',
      Currency: 'JOD',
      '1-2 Pax': 120,
      '3-6 Pax': 180,
    },
  ]);

  const preview = (await service.previewWorkbookImport({ buffer, originalname: 'legacy-with-placeholders.xlsx' })) as any;

  assert.equal(preview.success, true);
  assert.equal(preview.importer, 'LEGACY_TOURING_ROUTE_MATRIX');
  assert.equal(preview.workbookMode, 'Legacy Matrix Mode');
  assert.equal(preview.rowsToCreate.length, 2);
  assert.equal(preview.rowsToCreate[0].baseCost, 120);
  assert.equal(preview.rowsToCreate[1].baseCost, 180);
  assert.deepEqual(preview.errors, []);
});

test('touring matrix preview normalizes vehicle-rate columns from master tour matrix sheets', async () => {
  const { prisma, stores } = createTouringPrismaMock();
  stores.routes.push({ id: 'tour-1', code: 'AMM_PET', name: 'Petra Full Day', startCity: 'Amman', durationDays: 1 });
  const service = new TouringRoutesService(prisma as any);
  const buffer = buildTouringMatrixWorkbookBuffer(
    [
      {
        'Tour Code': 'AMM-PET',
        'Tour Name': 'Petra Full Day',
        'Departure City': 'Amman',
        'Return City': 'Amman',
        'Main Route': 'Amman - Petra - Amman',
        'Sedan Rate (JOD)': 95,
        'Van Rate (JOD)': 130,
        'Mini Bus Rate (JOD)': 150,
        'Bus Rate (JOD)': '',
      },
    ],
    'Jordan Master Tour Matrix',
  );

  const preview = (await service.previewWorkbookImport({ buffer, originalname: 'Jordan Master Tour Matrix.xlsx' })) as any;

  assert.equal(preview.success, true);
  assert.equal(preview.importer, 'LEGACY_TOURING_ROUTE_MATRIX');
  assert.equal(preview.workbookMode, 'Legacy Matrix Mode');
  assert.equal(preview.rowsToCreate.length, 3);
  assert.deepEqual(
    preview.rowsToCreate.map((row: any) => ({ vehicleType: row.vehicleType, minPax: row.minPax, maxPax: row.maxPax, baseCost: row.baseCost })),
    [
      { vehicleType: 'Sedan', minPax: 1, maxPax: 2, baseCost: 95 },
      { vehicleType: 'Van', minPax: 3, maxPax: 6, baseCost: 130 },
      { vehicleType: 'Mini Bus', minPax: 7, maxPax: 20, baseCost: 150 },
    ],
  );
  assert.match(preview.skippedRows.map((row: any) => row.reason).join(' | '), /Price is empty or zero for Bus Rate/);
});

test('touring matrix import creates normalized touring route pricing rows only', async () => {
  const { prisma, stores } = createTouringPrismaMock();
  stores.routes.push({ id: 'tour-1', code: 'AMM_PET', name: 'Petra Full Day', startCity: 'Amman', durationDays: 1 });
  const service = new TouringRoutesService(prisma as any);
  const buffer = buildTouringMatrixWorkbookBuffer([
    {
      RouteCode: 'AMM-PET',
      SupplierName: 'Alpha Transport',
      Currency: 'JOD',
      '1-2 Pax': 95,
    },
  ]);

  const result = (await service.importWorkbook({ buffer, originalname: 'touring-matrix.xlsx' })) as any;

  assert.equal(result.imported.pricings, 1);
  assert.equal(stores.pricings.length, 1);
  assert.equal(stores.pricings[0].touringRouteId, 'tour-1');
  assert.equal(stores.pricings[0].minPax, 1);
  assert.equal(stores.pricings[0].maxPax, 2);
  assert.equal(stores.pricings[0].baseCost, 95);
});

test('touring matrix preview skips duplicate existing missing route missing vehicle and empty prices', async () => {
  const { prisma, stores } = createTouringPrismaMock();
  stores.routes.push({ id: 'tour-1', code: 'AMM_PET', name: 'Petra Full Day', startCity: 'Amman', durationDays: 1 });
  stores.pricings.push({
    id: 'pricing-existing',
    touringRouteId: 'tour-1',
    supplierId: 'supplier-1',
    vehicleId: 'vehicle-1',
    pricingBasis: 'PER_VEHICLE',
    minPax: 1,
    maxPax: 2,
    currency: 'JOD',
    baseCost: 95,
    validFrom: null,
    validTo: null,
  });
  const service = new TouringRoutesService(prisma as any);
  const buffer = buildTouringMatrixWorkbookBuffer([
    { RouteCode: 'AMM-PET', SupplierName: 'Alpha Transport', Currency: 'JOD', '1-2 Pax': 95, '3-6 Pax': 0 },
    { RouteCode: 'MISSING', SupplierName: 'Alpha Transport', Currency: 'JOD', '1-2 Pax': 95 },
    { RouteCode: 'AMM-PET', SupplierName: 'Alpha Transport', VehicleType: 'Helicopter', Currency: 'JOD', '7-20 Pax': 400 },
  ]);
  stores.vehicles = stores.vehicles.filter((vehicle) => vehicle.id !== 'vehicle-3');

  const preview = (await service.previewWorkbookImport({ buffer, originalname: 'touring-matrix.xlsx' })) as any;
  const skippedReasons = preview.skippedRows.map((entry: any) => entry.reason).join(' | ');

  assert.match(skippedReasons, /Duplicate existing pricing row/);
  assert.match(skippedReasons, /Price is empty or zero/);
  assert.match(skippedReasons, /Route code MISSING does not exist/);
  assert.match(skippedReasons, /Vehicle type cannot be mapped/);
  assert.equal(preview.rowsToCreate.length, 0);
});

test('touring pricing normalization previews existing transport rules into touring route pricing rows', async () => {
  const { prisma, stores } = createTouringPrismaMock();
  stores.routes.push({ id: 'tour-1', code: 'AMM_PET', name: 'Petra Full Day', routeDescription: 'AMM PET', startCity: 'Amman', durationDays: 1 });
  stores.transportRules.push({
    id: 'rule-1',
    routeId: 'tour-1',
    supplierId: 'supplier-1',
    vehicleId: 'vehicle-1',
    transportServiceTypeId: 'service-type-1',
    pricingMode: 'POINT_TO_POINT',
    minPax: 1,
    maxPax: 2,
    baseCost: 95,
    currency: 'JOD',
    isActive: true,
  });
  const service = new TouringRoutesService(prisma as any);

  const preview = (await service.previewTransportPricingRuleNormalization()) as any;

  assert.equal(preview.importer, 'TRANSPORT_PRICING_RULE_TO_TOURING_ROUTE_PRICING');
  assert.equal(preview.pricingCount, 1);
  assert.equal(preview.rowsToCreate[0].touringRouteId, 'tour-1');
  assert.equal(preview.rowsToCreate[0].minPax, 1);
  assert.equal(preview.rowsToCreate[0].maxPax, 2);
  assert.equal(preview.rowsToCreate[0].baseCost, 95);
  assert.equal(stores.pricings.length, 0);
});

test('touring route update persists edits and archives without hard delete', async () => {
  const { prisma, stores } = createTouringPrismaMock();
  const service = new TouringRoutesService(prisma as any);
  const created = await service.create({
    code: 'PETRA-FD',
    name: 'Petra Full Day',
    startCity: 'Amman',
    durationDays: 1,
    mainDestinations: ['Petra'],
    estimatedDistanceKm: 240,
    estimatedDriveHours: 3.5,
    region: 'South',
    longDistance: true,
    desertRoad: true,
    mountainRoad: true,
    seasonalHeatRisk: true,
    sicPossible: true,
    overnightRisk: false,
    stops: [{ order: 1, city: 'Petra', location: 'Petra Visitor Center' }],
    pricings: [{ supplierId: 'supplier-1', vehicleId: 'vehicle-1', minPax: 1, maxPax: 3, currency: 'USD', baseCost: 180 }],
  } as any);

  await service.update(created.id, {
    name: 'Petra Full Day Updated',
    durationDays: 2,
    mainDestinations: ['Petra', 'Wadi Rum'],
    estimatedDistanceKm: 355,
    estimatedDriveHours: 5.5,
    region: 'South',
    overnightRisk: true,
    active: false,
    stops: [{ order: 1, city: 'Petra', location: 'Petra Visitor Center', notes: 'Overnight stop' }],
    pricings: [{ supplierId: 'supplier-1', vehicleId: 'vehicle-1', minPax: 1, maxPax: 5, currency: 'USD', baseCost: 220 }],
  } as any);

  assert.equal(stores.routes.length, 1);
  assert.equal(stores.routes[0].name, 'Petra Full Day Updated');
  assert.equal(stores.routes[0].durationDays, 2);
  assert.equal(stores.routes[0].active, false);
  assert.deepEqual(stores.routes[0].mainDestinations, ['Petra', 'Wadi Rum']);
  assert.equal(stores.routes[0].estimatedDistanceKm, 355);
  assert.equal(stores.routes[0].estimatedDriveHours, 5.5);
  assert.equal(stores.routes[0].region, 'South');
  assert.equal(stores.routes[0].longDistance, true);
  assert.equal(stores.routes[0].overnightRisk, true);
});

test('touring route duplicate preserves operational metadata and leaves source unchanged', async () => {
  const { prisma, stores } = createTouringPrismaMock();
  const service = new TouringRoutesService(prisma as any);
  const sourceRoute = {
    id: 'tour-source',
    code: 'AMMAN_JERASH_AJLOUN_AMMAN_RT',
    name: 'Amman - Jerash - Ajloun - Amman RT',
    startCity: 'Amman',
    durationDays: 1,
    routeDescription: 'Classic north circuit',
    mainDestinations: ['Jerash', 'Ajloun'],
    includedKm: 185,
    includedHours: 8,
    estimatedDistanceKm: 172,
    estimatedDriveHours: 3.75,
    region: 'North',
    longDistance: true,
    desertRoad: false,
    mountainRoad: true,
    seasonalHeatRisk: true,
    sicPossible: true,
    overnightRisk: false,
    reviewNotes: 'Use Ajloun road notes for winter operations.',
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    stops: [
      { id: 'stop-source-1', order: 1, city: 'Amman', location: 'Hotel pickup', notes: 'Start' },
      { id: 'stop-source-2', order: 2, city: 'Jerash', location: 'Jerash Archaeological Site', notes: 'Visit' },
      { id: 'stop-source-3', order: 3, city: 'Ajloun', location: 'Ajloun Castle', notes: 'Visit' },
    ],
    pricings: [{ id: 'pricing-source-1', baseCost: 100 }],
  };
  stores.routes.push(sourceRoute, {
    id: 'tour-existing-copy',
    code: 'COPY_OF_AMMAN_JERASH_AJLOUN_AMMAN_RT',
    name: 'Existing copy',
    startCity: 'Amman',
    durationDays: 1,
  });
  const originalSnapshot = JSON.parse(JSON.stringify(sourceRoute));

  const copy = (await service.duplicate(sourceRoute.id)) as any;

  assert.notEqual(copy.id, sourceRoute.id);
  assert.equal(copy.name, 'Copy of Amman - Jerash - Ajloun - Amman RT');
  assert.equal(copy.code, 'COPY_OF_AMMAN_JERASH_AJLOUN_AMMAN_RT_2');
  assert.notEqual(copy.code, sourceRoute.code);
  assert.equal(copy.active, false);
  assert.equal(copy.startCity, sourceRoute.startCity);
  assert.equal(copy.durationDays, sourceRoute.durationDays);
  assert.equal(copy.routeDescription, sourceRoute.routeDescription);
  assert.deepEqual(copy.mainDestinations, sourceRoute.mainDestinations);
  assert.equal(copy.includedKm, sourceRoute.includedKm);
  assert.equal(copy.includedHours, sourceRoute.includedHours);
  assert.equal(copy.estimatedDistanceKm, sourceRoute.estimatedDistanceKm);
  assert.equal(copy.estimatedDriveHours, sourceRoute.estimatedDriveHours);
  assert.equal(copy.region, sourceRoute.region);
  assert.equal(copy.longDistance, true);
  assert.equal(copy.mountainRoad, true);
  assert.equal(copy.seasonalHeatRisk, true);
  assert.equal(copy.sicPossible, true);
  assert.equal(copy.reviewNotes, sourceRoute.reviewNotes);
  assert.equal(copy.createdAt, undefined);
  assert.equal(copy.updatedAt, undefined);
  assert.equal(copy.pricings.length, 0);
  assert.equal(copy.stops.length, sourceRoute.stops.length);
  assert.deepEqual(
    copy.stops.map((stop: any) => ({ order: stop.order, city: stop.city, location: stop.location, notes: stop.notes })),
    sourceRoute.stops.map((stop) => ({ order: stop.order, city: stop.city, location: stop.location, notes: stop.notes })),
  );
  assert.ok(copy.stops.every((stop: any) => !sourceRoute.stops.some((sourceStop) => sourceStop.id === stop.id)));
  assert.deepEqual(JSON.parse(JSON.stringify(sourceRoute)), originalSnapshot);
});
