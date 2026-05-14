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
    vehicles: [{ id: 'vehicle-1', name: 'Sedan 3', vehicleType: 'Sedan' }],
    routes: [] as any[],
    stops: [] as any[],
    pricings: [] as any[],
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

  const preview = await service.previewWorkbookImport({ buffer, originalname: 'touring.xlsx' });
  assert.equal(preview.success, true);
  assert.equal(preview.routeCount, 1);
  assert.equal(preview.stopCount, 1);
  assert.equal(preview.pricingCount, 1);
  assert.equal(preview.routes[0].importDecision, 'NEW');
  assert.equal(preview.pricings[0].importDecision, 'NEW');
  assert.deepEqual(preview.errors, []);
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
