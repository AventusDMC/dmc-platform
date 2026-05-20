import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { VehicleRatesService } from './vehicle-rates.service';

const fleet = [
  { column: 'Sedan 2', name: 'Sedan 2', maxPax: 2 },
  { column: 'Mini Van 6', name: 'Mini Van 6', maxPax: 6 },
  { column: 'Van 9', name: 'Van 9', maxPax: 9 },
  { column: 'Toyota Coaster / Mini Bus 17', name: 'Toyota Coaster / Mini Bus 17', maxPax: 17 },
  { column: 'Medium Bus 30', name: 'Medium Bus 30', maxPax: 30 },
  { column: 'Large Coach 49', name: 'Large Coach 49', maxPax: 49 },
];

function workbookBuffer(rows: Array<Record<string, unknown>>) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Transfer Tariffs');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

function createPrismaMock(options: { rates?: any[] } = {}) {
  const suppliers = [
    { id: 'supplier-almushtari', name: 'Almushtari Logistics Services', type: 'transport' },
    { id: 'supplier-alpha', name: 'Alpha Transportation', type: 'transport' },
  ];
  const vehicles = fleet.map((vehicle) => ({
    id: `vehicle-${vehicle.maxPax}`,
    name: vehicle.name,
    maxPax: vehicle.maxPax,
  }));
  const canonicalRoute = {
    id: 'route-amman-petra',
    normalizedKey: 'amman_petra',
    name: 'Amman -> Petra',
    notes: null,
    fromPlace: { name: 'Amman' },
    toPlace: { name: 'Petra' },
  };
  const legacyRoute = {
    id: 'route-legacy',
    normalizedKey: 'legacy_route',
    name: 'Legacy manual route',
    notes: 'manual historical import',
    fromPlace: null,
    toPlace: null,
  };
  const updates: any[] = [];
  const rates =
    options.rates ||
    vehicles.map((vehicle, index) => ({
      id: `rate-almushtari-${vehicle.maxPax}`,
      routeId: canonicalRoute.id,
      supplierId: suppliers[0].id,
      routeName: canonicalRoute.name,
      price: 100 + index,
      currency: 'USD',
      validFrom: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      createdAt: new Date('2026-01-01'),
      supplier: suppliers[0],
      vehicle,
      serviceType: { name: 'Private Transfer', code: 'PRIVATE_TRANSFER', classification: 'ROUTE_TRANSFER' },
      route: canonicalRoute,
    }));

  return {
    updates,
    prisma: {
      route: {
        findMany: async () => [canonicalRoute, legacyRoute],
      },
      supplier: {
        findMany: async () => suppliers,
      },
      vehicle: {
        findMany: async () => vehicles,
      },
      vehicleRate: {
        findMany: async () => [
          ...rates,
          {
            id: 'rate-legacy-should-not-update',
            routeId: legacyRoute.id,
            supplierId: suppliers[0].id,
            routeName: legacyRoute.name,
            price: 999,
            currency: 'USD',
            validFrom: new Date('2026-01-01'),
            updatedAt: new Date('2026-01-02'),
            createdAt: new Date('2026-01-01'),
            supplier: suppliers[0],
            vehicle: vehicles[0],
            serviceType: { name: 'Private Transfer', code: 'PRIVATE_TRANSFER', classification: 'ROUTE_TRANSFER' },
            route: legacyRoute,
          },
        ],
        update: async (args: any) => {
          updates.push(args);
          return { id: args.where.id, ...args.data };
        },
      },
    },
  };
}

test('supplier tariff matrix import previews changes and applies only with apply flag', async () => {
  const { prisma, updates } = createPrismaMock();
  const service = new VehicleRatesService(prisma as any);
  const row: Record<string, unknown> = {
    'Route Code': 'TRF-AMMAN__PETRA',
    Supplier: 'Almushtari Logistics Services',
  };
  fleet.forEach((vehicle, index) => {
    row[vehicle.column] = 200 + index;
  });
  const buffer = workbookBuffer([row]);

  const preview = await service.importTransferRouteTariffMatrixWorkbook(buffer);

  assert.equal(preview.apply, false);
  assert.equal(preview.rowsRead, 1);
  assert.equal(preview.updated, 0);
  assert.equal(preview.changes.length, 6);
  assert.equal(preview.issues.length, 0);
  assert.equal(updates.length, 0);

  const applied = await service.importTransferRouteTariffMatrixWorkbook(buffer, { apply: true });

  assert.equal(applied.apply, true);
  assert.equal(applied.updated, 6);
  assert.equal(updates.length, 6);
  assert.deepEqual(
    updates.map((update) => update.where.id),
    ['rate-almushtari-2', 'rate-almushtari-6', 'rate-almushtari-9', 'rate-almushtari-17', 'rate-almushtari-30', 'rate-almushtari-49'],
  );
  assert.ok(!updates.some((update) => update.where.id === 'rate-legacy-should-not-update'));
});

test('supplier tariff matrix import reports unsafe rows before mutating rates', async () => {
  const vehicles = fleet.map((vehicle) => ({
    id: `vehicle-${vehicle.maxPax}`,
    name: vehicle.name,
    maxPax: vehicle.maxPax,
  }));
  const { prisma, updates } = createPrismaMock({
    rates: [
      {
        id: 'rate-almushtari-sedan',
        routeId: 'route-amman-petra',
        supplierId: 'supplier-almushtari',
        routeName: 'Amman -> Petra',
        price: 100,
        currency: 'USD',
        validFrom: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
        createdAt: new Date('2026-01-01'),
        supplier: { id: 'supplier-almushtari', name: 'Almushtari Logistics Services' },
        vehicle: vehicles[0],
        serviceType: { name: 'Private Transfer', code: 'PRIVATE_TRANSFER', classification: 'ROUTE_TRANSFER' },
        route: { id: 'route-amman-petra', name: 'Amman -> Petra' },
      },
    ],
  });
  const service = new VehicleRatesService(prisma as any);
  const buffer = workbookBuffer([
    {
      'Route Code': 'TRF-AMMAN__PETRA',
      Supplier: 'Almushtari Logistics Services',
      'Sedan 2': 'not a number',
      'Mini Van 6': '',
      'Van 9': 330,
    },
    {
      'Route Code': 'TRF-UNKNOWN',
      Supplier: 'Almushtari Logistics Services',
      'Sedan 2': 120,
    },
    {
      'Route Code': 'TRF-AMMAN__PETRA',
      Supplier: 'Ghost Transport',
      'Sedan 2': 120,
    },
    {
      'Route Code': 'TRF-AMMAN__PETRA',
      Supplier: 'Almushtari Logistics Services',
      'Sedan 2': 125,
    },
  ]);

  const result = await service.importTransferRouteTariffMatrixWorkbook(buffer, { apply: true });
  const issueTypes = new Set(result.issues.map((issue) => issue.type));

  assert.equal(result.updated, 0);
  assert.equal(updates.length, 0);
  assert.ok(issueTypes.has('INVALID_PRICE'));
  assert.ok(issueTypes.has('EMPTY_VALUE'));
  assert.ok(issueTypes.has('MISSING_RATE'));
  assert.ok(issueTypes.has('UNKNOWN_ROUTE'));
  assert.ok(issueTypes.has('UNKNOWN_SUPPLIER'));
  assert.ok(issueTypes.has('DUPLICATE_ROW'));
});

test('supplier tariff matrix import maps full route codes to the exact canonical transfer route', async () => {
  const supplier = { id: 'supplier-almushtari', name: 'Almushtari Logistics Services', type: 'transport' };
  const sedan = { id: 'vehicle-2', name: 'Sedan 2', maxPax: 2 };
  const routes = [
    {
      id: 'route-aqaba-city',
      normalizedKey: 'jordan_aqaba_city_petra',
      name: 'Aqaba City -> Petra',
      notes: null,
      fromPlace: { name: 'Aqaba City' },
      toPlace: { name: 'Petra' },
    },
    {
      id: 'route-aqj-airport',
      normalizedKey: 'jordan_aqaba_airport_petra',
      name: 'AQJ Airport -> Petra',
      notes: null,
      fromPlace: { name: 'AQJ Airport' },
      toPlace: { name: 'Petra' },
    },
    {
      id: 'route-petra',
      normalizedKey: 'amman_petra',
      name: 'Amman -> Petra',
      notes: null,
      fromPlace: { name: 'Amman' },
      toPlace: { name: 'Petra' },
    },
    {
      id: 'route-petra-archaeological-area',
      normalizedKey: 'amman_petra_archaeological_area',
      name: 'Amman -> Petra Archaeological Area',
      notes: null,
      fromPlace: { name: 'Amman' },
      toPlace: { name: 'Petra Archaeological Area' },
    },
    {
      id: 'route-wadi-rum',
      normalizedKey: 'petra_wadi_rum',
      name: 'Petra -> Wadi Rum',
      notes: null,
      fromPlace: { name: 'Petra' },
      toPlace: { name: 'Wadi Rum' },
    },
    {
      id: 'route-wadi-rum-village',
      normalizedKey: 'petra_wadi_rum_village',
      name: 'Petra -> Wadi Rum Village',
      notes: null,
      fromPlace: { name: 'Petra' },
      toPlace: { name: 'Wadi Rum Village' },
    },
  ];
  const updates: any[] = [];
  const prisma = {
    route: {
      findMany: async () => routes,
    },
    supplier: {
      findMany: async () => [supplier],
    },
    vehicle: {
      findMany: async () => [sedan],
    },
    vehicleRate: {
      findMany: async () =>
        routes.map((route) => ({
          id: `rate-${route.id}`,
          routeId: route.id,
          supplierId: supplier.id,
          routeName: route.name,
          price: 100,
          currency: 'USD',
          validFrom: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-02'),
          createdAt: new Date('2026-01-01'),
          supplier,
          vehicle: sedan,
          serviceType: { name: 'Private Transfer', code: 'PRIVATE_TRANSFER', classification: 'ROUTE_TRANSFER' },
          route,
        })),
      update: async (args: any) => {
        updates.push(args);
        return { id: args.where.id, ...args.data };
      },
    },
  };
  const service = new VehicleRatesService(prisma as any);
  const result = await service.importTransferRouteTariffMatrixWorkbook(
    workbookBuffer([
      { 'Route Code': 'TRF-AQJ-AIRPORT__PETRA', Supplier: supplier.name, 'Sedan 2': 220 },
      { 'Route Code': 'TRF-AMMAN__PETRA-ARCHAEOLOGICAL-AREA', Supplier: supplier.name, 'Sedan 2': 230 },
      { 'Route Code': 'TRF-PETRA__WADI-RUM-VILLAGE', Supplier: supplier.name, 'Sedan 2': 240 },
    ]),
    { apply: true },
  );

  assert.equal(result.updated, 3);
  assert.deepEqual(
    updates.map((update) => update.where.id),
    ['rate-route-aqj-airport', 'rate-route-petra-archaeological-area', 'rate-route-wadi-rum-village'],
  );
  assert.ok(!updates.some((update) => update.where.id === 'rate-route-aqaba-city'));
  assert.ok(!updates.some((update) => update.where.id === 'rate-route-petra'));
  assert.ok(!updates.some((update) => update.where.id === 'rate-route-wadi-rum'));
});

test('supplier tariff matrix import dry-run fails when canonical route codes collide', async () => {
  const supplier = { id: 'supplier-almushtari', name: 'Almushtari Logistics Services', type: 'transport' };
  const sedan = { id: 'vehicle-2', name: 'Sedan 2', maxPax: 2 };
  const updates: any[] = [];
  const prisma = {
    route: {
      findMany: async () => [
        {
          id: 'route-one',
          normalizedKey: 'amman_petra_one',
          name: 'Amman -> Petra',
          notes: null,
          fromPlace: { name: 'Amman' },
          toPlace: { name: 'Petra' },
        },
        {
          id: 'route-two',
          normalizedKey: 'amman_petra_two',
          name: 'Amman -> Petra duplicate',
          notes: null,
          fromPlace: { name: 'Amman' },
          toPlace: { name: 'Petra' },
        },
      ],
    },
    supplier: {
      findMany: async () => [supplier],
    },
    vehicle: {
      findMany: async () => [sedan],
    },
    vehicleRate: {
      findMany: async () => [],
      update: async (args: any) => {
        updates.push(args);
        return args;
      },
    },
  };
  const service = new VehicleRatesService(prisma as any);
  const result = await service.importTransferRouteTariffMatrixWorkbook(
    workbookBuffer([{ 'Route Code': 'TRF-AMMAN__PETRA', Supplier: supplier.name, 'Sedan 2': 120 }]),
    { apply: true },
  );

  assert.equal(result.updated, 0);
  assert.equal(updates.length, 0);
  assert.deepEqual(result.issues.map((issue) => issue.type), ['AMBIGUOUS_ROUTE_CODE']);
  assert.equal(result.issues[0].routeCode, 'TRF-AMMAN__PETRA');
});
