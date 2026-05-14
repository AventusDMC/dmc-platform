import test = require('node:test');
import assert = require('node:assert/strict');
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS = require('exceljs');
import * as XLSX from 'xlsx';
import { TouringRoutesService } from './touring-routes.service';

const schemaSource = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
const controllerSource = readFileSync(join(__dirname, 'touring-routes.controller.ts'), 'utf8');
const serviceSource = readFileSync(join(__dirname, 'touring-routes.service.ts'), 'utf8');

test('touring route foundation defines separate inventory, stops, pricing, and transport classification', () => {
  assert.match(schemaSource, /model TouringRoute\s+\{/);
  assert.match(schemaSource, /model TouringRouteStop\s+\{/);
  assert.match(schemaSource, /model TouringRoutePricing\s+\{/);
  assert.match(schemaSource, /TOURING_ROUTE/);
  assert.match(schemaSource, /includedKm\s+Float\?/);
  assert.match(schemaSource, /includedHours\s+Float\?/);
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
        const route = { id: `tour-${stores.routes.length + 1}`, ...data };
        stores.routes.push(route);
        return route;
      },
      update: async ({ where, data }: any) => {
        const route = stores.routes.find((entry) => entry.id === where.id);
        Object.assign(route, data);
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
    stops: [{ order: 1, city: 'Petra', location: 'Petra Visitor Center' }],
    pricings: [{ supplierId: 'supplier-1', vehicleId: 'vehicle-1', minPax: 1, maxPax: 3, currency: 'USD', baseCost: 180 }],
  } as any);

  await service.update(created.id, {
    name: 'Petra Full Day Updated',
    durationDays: 2,
    mainDestinations: ['Petra', 'Wadi Rum'],
    active: false,
    stops: [{ order: 1, city: 'Petra', location: 'Petra Visitor Center', notes: 'Overnight stop' }],
    pricings: [{ supplierId: 'supplier-1', vehicleId: 'vehicle-1', minPax: 1, maxPax: 5, currency: 'USD', baseCost: 220 }],
  } as any);

  assert.equal(stores.routes.length, 1);
  assert.equal(stores.routes[0].name, 'Petra Full Day Updated');
  assert.equal(stores.routes[0].durationDays, 2);
  assert.equal(stores.routes[0].active, false);
  assert.deepEqual(stores.routes[0].mainDestinations, ['Petra', 'Wadi Rum']);
});
