import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { correctGoldenTouringRoutePricingVehicles, seedGoldenTouringRoutePricingPhase1 } from '../../prisma/seeds/seed-golden-touring-route-pricing-phase1';

type Store = Record<string, any[]>;

const packageSource = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');
const scriptSource = readFileSync(join(__dirname, '..', '..', 'prisma', 'seeds', 'seed-golden-touring-route-pricing-phase1.ts'), 'utf8');

function matchesWhere(record: any, where: Record<string, any> = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return (value as Array<Record<string, any>>).some((clause) => matchesWhere(record, clause));
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('equals' in value) return String(record[key] || '').toLowerCase() === String(value.equals || '').toLowerCase();
      if ('in' in value) return value.in.includes(record[key]);
      return true;
    }
    return record[key] === value;
  });
}

function createModel(store: Store, key: string, onDelete: () => void) {
  return {
    findMany: async ({ where }: any = {}) => store[key].filter((record) => matchesWhere(record, where)),
    findFirst: async ({ where }: any = {}) => store[key].find((record) => matchesWhere(record, where)) || null,
    count: async ({ where }: any = {}) => store[key].filter((record) => matchesWhere(record, where)).length,
    create: async ({ data }: any) => {
      const record = { id: `${key}-${store[key].length + 1}`, ...data };
      store[key].push(record);
      return record;
    },
    update: async ({ where, data }: any) => {
      const record = store[key].find((entry) => entry.id === where.id);
      if (!record) throw new Error(`${key} ${where.id} not found`);
      Object.assign(record, data);
      return record;
    },
    delete: onDelete,
    deleteMany: onDelete,
  };
}

function createPrismaMock(overrides: Partial<Store> = {}) {
  let destructiveCalls = 0;
  const store: Store = {
    touringRoutes: [],
    touringRoutePricings: [],
    vehicles: [],
    transportServiceTypes: [],
    quoteItems: [],
    bookingServices: [],
    ...overrides,
  };
  const onDelete = () => {
    destructiveCalls += 1;
    throw new Error('Pricing completion must not delete records');
  };
  return {
    store,
    getDestructiveCalls: () => destructiveCalls,
    prisma: {
      touringRoute: {
        findMany: async ({ where }: any = {}) =>
          store.touringRoutes
            .filter((record) => matchesWhere(record, where))
            .map((route) => ({
              ...route,
              pricings: store.touringRoutePricings.filter((pricing) => pricing.touringRouteId === route.id && pricing.active !== false),
            })),
      },
      touringRoutePricing: createModel(store, 'touringRoutePricings', onDelete),
      vehicle: createModel(store, 'vehicles', onDelete),
      transportServiceType: createModel(store, 'transportServiceTypes', onDelete),
      quoteItem: createModel(store, 'quoteItems', onDelete),
      bookingService: createModel(store, 'bookingServices', onDelete),
    },
  };
}

const silentLogger = { log: () => undefined, warn: () => undefined };

const targetVehicles = [
  { id: 'vehicle-sedan', name: 'Sedan 2', vehicleType: 'Sedan', maxPax: 2, supplierId: 'supplier-1' },
  { id: 'vehicle-minivan', name: 'Mini Van 6', vehicleType: 'Mini Van', maxPax: 6, supplierId: 'supplier-1' },
  { id: 'vehicle-van', name: 'Van 9', vehicleType: 'Van', maxPax: 9, supplierId: 'supplier-1' },
  { id: 'vehicle-coaster', name: 'Toyota Coaster / Mini Bus 17', vehicleType: 'Mini Bus', maxPax: 17, supplierId: 'supplier-1' },
  { id: 'vehicle-medium', name: 'Medium Bus 30', vehicleType: 'Medium Bus', maxPax: 30, supplierId: 'supplier-1' },
  { id: 'vehicle-large', name: 'Large Coach 49', vehicleType: 'Large Coach', maxPax: 49, supplierId: 'supplier-1' },
];

const goldenRoute = {
  id: 'route-jerash',
  code: 'JOR-TR-NORTH-JERASH-RT',
  name: 'Amman - Jerash - Amman RT',
  active: true,
  durationDays: 1,
  estimatedDistanceKm: 105,
  estimatedDriveHours: 2.1,
  includedKm: 105,
  includedHours: 2.1,
};

test('golden touring pricing completion script is dry-run first and non-destructive', () => {
  assert.match(packageSource, /"seed:golden-touring-pricing": "ts-node prisma\/seeds\/seed-golden-touring-route-pricing-phase1\.ts"/);
  assert.match(scriptSource, /dryRun = !process\.argv\.includes\('--apply'\)/);
  assert.match(scriptSource, /--correct-vehicles/);
  assert.doesNotMatch(scriptSource, /\.deleteMany\(/);
  assert.doesNotMatch(scriptSource, /\.delete\(/);
});

test('dry-run suggests missing pricing by route and vehicle type without creating rows', async () => {
  const logs: string[] = [];
  const logger = { log: (message: unknown) => logs.push(String(message)), warn: (message: unknown) => logs.push(String(message)) };
  const { prisma, store } = createPrismaMock({
    touringRoutes: [goldenRoute],
    vehicles: targetVehicles,
  });

  const summary = await seedGoldenTouringRoutePricingPhase1(prisma, { logger });

  assert.equal(summary.dryRun, true);
  assert.equal(summary.routesChecked, 1);
  assert.equal(summary.suggestions, 6);
  assert.equal(store.touringRoutePricings.length, 0);
  assert.match(logs.join('\n'), /Route Code \| Vehicle \| Suggested Cost \| Currency \| Source\/Reason/);
  assert.match(logs.join('\n'), /JOR-TR-NORTH-JERASH-RT \| Sedan \|/);
  assert.match(logs.join('\n'), /JOR-TR-NORTH-JERASH-RT \| Large Bus \|/);
});

test('apply creates only missing vehicle type pricing and preserves existing currency', async () => {
  const { prisma, store, getDestructiveCalls } = createPrismaMock({
    touringRoutes: [goldenRoute],
    vehicles: targetVehicles,
    transportServiceTypes: [{ id: 'service-daily', name: 'Daily Full Day', code: 'DAILY_FULL_DAY', classification: 'FULL_DAY' }],
    touringRoutePricings: [
      {
        id: 'pricing-existing-sedan',
        touringRouteId: goldenRoute.id,
        active: true,
        vehicleId: 'vehicle-sedan',
        vehicle: targetVehicles[0],
        currency: 'USD',
        baseCost: 99,
      },
    ],
  });

  const summary = await seedGoldenTouringRoutePricingPhase1(prisma, { dryRun: false, logger: silentLogger });

  assert.equal(summary.skippedExisting, 1);
  assert.equal(summary.created, 5);
  assert.equal(store.touringRoutePricings.length, 6);
  assert.equal(store.touringRoutePricings.find((pricing) => pricing.id === 'pricing-existing-sedan')?.baseCost, 99);
  const created = store.touringRoutePricings.filter((pricing) => pricing.id !== 'pricing-existing-sedan');
  assert.equal(created.every((pricing) => pricing.currency === 'USD'), true);
  assert.equal(created.every((pricing) => pricing.transportServiceTypeId === 'service-daily'), true);
  assert.equal(getDestructiveCalls(), 0);
});

test('apply creates Daily Full Day service type when missing and reports missing vehicle mappings', async () => {
  const { prisma, store } = createPrismaMock({
    touringRoutes: [goldenRoute],
    vehicles: targetVehicles.slice(0, 1),
  });

  const summary = await seedGoldenTouringRoutePricingPhase1(prisma, { dryRun: false, logger: silentLogger });

  assert.equal(summary.created, 1);
  assert.equal(summary.skippedMissingVehicle, 5);
  assert.equal(store.transportServiceTypes[0].name, 'Daily Full Day');
  assert.equal(store.touringRoutePricings[0].transportServiceTypeId, store.transportServiceTypes[0].id);
  assert.equal(store.touringRoutePricings[0].currency, 'JOD');
});

test('keeps the Amman Petra overnight Large Bus suggested cost at the approved value', async () => {
  const logs: string[] = [];
  const logger = { log: (message: unknown) => logs.push(String(message)), warn: (message: unknown) => logs.push(String(message)) };
  const { prisma } = createPrismaMock({
    touringRoutes: [{
      id: 'route-amman-petra',
      code: 'JOR-TR-SOUTH-AMMAN-PETRA-ON',
      name: 'Amman - Petra ON',
      active: true,
      durationDays: 2,
      estimatedDistanceKm: 240,
      estimatedDriveHours: 3.4,
      includedKm: 240,
      includedHours: 3.4,
      desertRoad: true,
      overnightRisk: true,
    }],
    vehicles: targetVehicles,
  });

  await seedGoldenTouringRoutePricingPhase1(prisma, { logger });

  assert.match(logs.join('\n'), /JOR-TR-SOUTH-AMMAN-PETRA-ON \| Large Bus \| 490 \| JOD/);
});

test('uses exact canonical vehicle mapping and does not fall back to loose aliases', async () => {
  const { prisma, store } = createPrismaMock({
    touringRoutes: [goldenRoute],
    vehicles: [
      { id: 'vehicle-minivan', name: 'Mini Van 6', vehicleType: 'Mini Van', maxPax: 6, supplierId: 'supplier-1' },
      { id: 'vehicle-coaster', name: 'Toyota Coaster Mini Coach', vehicleType: 'Mini Bus', maxPax: 17, supplierId: 'supplier-1' },
      { id: 'vehicle-large', name: 'Large Coach 49', vehicleType: 'Large Bus', maxPax: 49, supplierId: 'supplier-1' },
    ],
    transportServiceTypes: [{ id: 'service-daily', name: 'Daily Full Day', code: 'DAILY_FULL_DAY', classification: 'FULL_DAY' }],
  });

  await seedGoldenTouringRoutePricingPhase1(prisma, { dryRun: false, logger: silentLogger });

  const van = store.touringRoutePricings.find((pricing) => pricing.minPax === 7 && pricing.maxPax === 9);
  const coaster = store.touringRoutePricings.find((pricing) => pricing.minPax === 10 && pricing.maxPax === 17);
  const large = store.touringRoutePricings.find((pricing) => pricing.minPax === 31 && pricing.maxPax === 49);
  assert.equal(van, undefined);
  assert.equal(coaster, undefined);
  assert.equal(large?.vehicleId, 'vehicle-large');
  assert.equal(store.touringRoutePricings.some((pricing) => pricing.vehicleId === 'vehicle-minivan' && pricing.minPax === 7), false);
  assert.equal(store.touringRoutePricings.some((pricing) => pricing.vehicleId === 'vehicle-coaster'), false);
});

test('reports skippedMissingVehicle when exact canonical vehicle is absent', async () => {
  const logs: string[] = [];
  const logger = { log: (message: unknown) => logs.push(String(message)), warn: (message: unknown) => logs.push(String(message)) };
  const { prisma, store } = createPrismaMock({
    touringRoutes: [goldenRoute],
    vehicles: [
      { id: 'vehicle-minivan', name: 'Mini Van 6', vehicleType: 'Mini Van', maxPax: 6, supplierId: 'supplier-1' },
      { id: 'vehicle-coaster-loose', name: 'Toyota Coaster', vehicleType: 'Mini Bus', maxPax: 17, supplierId: 'supplier-1' },
      { id: 'vehicle-large-loose', name: 'Large 49', vehicleType: 'Large Bus', maxPax: 49, supplierId: 'supplier-1' },
    ],
    transportServiceTypes: [{ id: 'service-daily', name: 'Daily Full Day', code: 'DAILY_FULL_DAY', classification: 'FULL_DAY' }],
  });

  const summary = await seedGoldenTouringRoutePricingPhase1(prisma, { dryRun: false, logger });

  assert.equal(summary.created, 1);
  assert.equal(summary.skippedMissingVehicle, 5);
  assert.equal(store.touringRoutePricings.length, 1);
  assert.equal(store.touringRoutePricings[0].vehicleId, 'vehicle-minivan');
  assert.match(logs.join('\n'), /JOR-TR-NORTH-JERASH-RT \| Van \| - \| JOD \| Missing exact canonical vehicle Van 9/);
  assert.match(logs.join('\n'), /JOR-TR-NORTH-JERASH-RT \| Mini Bus \/ Coaster \| - \| JOD \| Missing exact canonical vehicle Toyota Coaster \/ Mini Bus 17/);
  assert.match(logs.join('\n'), /JOR-TR-NORTH-JERASH-RT \| Large Bus \| - \| JOD \| Missing exact canonical vehicle Large Coach 49/);
});

test('dry-run warns for invalid labels, unrealistic hierarchy, and duplicate capacity overlaps', async () => {
  const logs: string[] = [];
  const logger = { log: (message: unknown) => logs.push(String(message)), warn: (message: unknown) => logs.push(String(message)) };
  const { prisma } = createPrismaMock({
    touringRoutes: [goldenRoute],
    vehicles: targetVehicles,
    touringRoutePricings: [
      {
        id: 'bad-large',
        touringRouteId: goldenRoute.id,
        active: true,
        minPax: 31,
        maxPax: 49,
        baseCost: 120,
        vehicle: { id: 'vehicle-coaster', name: 'Toyota Coaster Mini Coach', vehicleType: 'Mini Bus', maxPax: 17 },
      },
      {
        id: 'medium',
        touringRouteId: goldenRoute.id,
        active: true,
        minPax: 18,
        maxPax: 30,
        baseCost: 200,
        vehicle: { id: 'vehicle-medium', name: 'Medium 30', vehicleType: 'Medium Bus', maxPax: 30 },
      },
      {
        id: 'overlap',
        touringRouteId: goldenRoute.id,
        active: true,
        minPax: 25,
        maxPax: 35,
        baseCost: 230,
        vehicle: { id: 'vehicle-large', name: 'Large 49', vehicleType: 'Large Bus', maxPax: 49 },
      },
    ],
  });

  const summary = await seedGoldenTouringRoutePricingPhase1(prisma, { logger });
  const output = logs.join('\n');

  assert.ok(summary.validationWarnings >= 3);
  assert.match(output, /invalid vehicle label/);
  assert.match(output, /unrealistic hierarchy/);
  assert.match(output, /duplicate capacity overlap/);
});

test('large bus suggestion is not lower than medium bus and stays within normal hierarchy', async () => {
  const logs: string[] = [];
  const logger = { log: (message: unknown) => logs.push(String(message)), warn: (message: unknown) => logs.push(String(message)) };
  const { prisma } = createPrismaMock({
    touringRoutes: [goldenRoute],
    vehicles: targetVehicles,
  });

  await seedGoldenTouringRoutePricingPhase1(prisma, { logger });

  const output = logs.join('\n');
  const medium = Number(output.match(/JOR-TR-NORTH-JERASH-RT \| Medium Bus \| (\d+) \|/)?.[1]);
  const large = Number(output.match(/JOR-TR-NORTH-JERASH-RT \| Large Bus \| (\d+) \|/)?.[1]);
  assert.ok(large >= medium);
  assert.ok(large <= Math.round((medium * 1.3) / 5) * 5);
});

test('dry-run vehicle correction reports wrong Golden pricing vehicle links without mutating', async () => {
  const logs: string[] = [];
  const logger = { log: (message: unknown) => logs.push(String(message)), warn: (message: unknown) => logs.push(String(message)) };
  const { prisma, store } = createPrismaMock({
    vehicles: targetVehicles,
    touringRoutePricings: [
      {
        id: 'pricing-van-wrong',
        touringRouteId: goldenRoute.id,
        touringRoute: goldenRoute,
        active: true,
        vehicleId: 'vehicle-minivan',
        vehicle: targetVehicles[1],
        minPax: 7,
        maxPax: 9,
        baseCost: 100,
        currency: 'JOD',
        notes: 'Golden Touring Route Pricing Completion Phase 1: estimate',
      },
      {
        id: 'pricing-large-wrong',
        touringRouteId: goldenRoute.id,
        touringRoute: goldenRoute,
        active: true,
        vehicleId: 'vehicle-coaster',
        vehicle: targetVehicles[3],
        minPax: 31,
        maxPax: 49,
        baseCost: 200,
        currency: 'JOD',
        notes: 'Golden Touring Route Pricing Completion Phase 1: estimate',
      },
    ],
  });

  const summary = await correctGoldenTouringRoutePricingVehicles(prisma, { logger });
  const output = logs.join('\n');

  assert.equal(summary.dryRun, true);
  assert.equal(summary.rowsChecked, 2);
  assert.equal(summary.candidates, 2);
  assert.equal(summary.remapped, 0);
  assert.equal(store.touringRoutePricings[0].vehicleId, 'vehicle-minivan');
  assert.equal(store.touringRoutePricings[1].vehicleId, 'vehicle-coaster');
  assert.match(output, /Route Code \| Pax Range \| Current Vehicle \| Correct Vehicle \| Action/);
  assert.match(output, /JOR-TR-NORTH-JERASH-RT \| 7-9 \| Mini Van 6 \| Van 9 \| Would remap vehicleId/);
  assert.match(output, /JOR-TR-NORTH-JERASH-RT \| 31-49 \| Toyota Coaster \/ Mini Bus 17 \| Large Coach 49 \| Would remap vehicleId/);
});

test('apply vehicle correction remaps only vehicleId for unreferenced Golden pricing rows', async () => {
  const { prisma, store } = createPrismaMock({
    vehicles: targetVehicles,
    touringRoutePricings: [
      {
        id: 'pricing-van-wrong',
        touringRouteId: goldenRoute.id,
        touringRoute: goldenRoute,
        active: true,
        vehicleId: 'vehicle-minivan',
        vehicle: targetVehicles[1],
        minPax: 7,
        maxPax: 9,
        baseCost: 100,
        currency: 'USD',
        notes: 'Golden Touring Route Pricing Completion Phase 1: estimate',
      },
    ],
  });

  const summary = await correctGoldenTouringRoutePricingVehicles(prisma, { dryRun: false, logger: silentLogger });

  assert.equal(summary.candidates, 1);
  assert.equal(summary.remapped, 1);
  assert.equal(store.touringRoutePricings[0].vehicleId, 'vehicle-van');
  assert.equal(store.touringRoutePricings[0].baseCost, 100);
  assert.equal(store.touringRoutePricings[0].currency, 'USD');
  assert.equal(store.touringRoutePricings[0].touringRouteId, goldenRoute.id);
});

test('vehicle correction skips referenced, non-Golden, unsupported, and missing-canonical rows', async () => {
  const logs: string[] = [];
  const logger = { log: (message: unknown) => logs.push(String(message)), warn: (message: unknown) => logs.push(String(message)) };
  const { prisma, store } = createPrismaMock({
    vehicles: targetVehicles.filter((vehicle) => vehicle.id !== 'vehicle-large'),
    touringRoutePricings: [
      {
        id: 'pricing-referenced',
        touringRouteId: goldenRoute.id,
        touringRoute: goldenRoute,
        active: true,
        vehicleId: 'vehicle-minivan',
        vehicle: targetVehicles[1],
        minPax: 7,
        maxPax: 9,
        notes: 'Golden Touring Route Pricing Completion Phase 1: estimate',
      },
      {
        id: 'pricing-non-golden',
        touringRouteId: goldenRoute.id,
        touringRoute: goldenRoute,
        active: true,
        vehicleId: 'vehicle-minivan',
        vehicle: targetVehicles[1],
        minPax: 7,
        maxPax: 9,
        notes: 'Supplier historical row',
      },
      {
        id: 'pricing-unsupported',
        touringRouteId: goldenRoute.id,
        touringRoute: goldenRoute,
        active: true,
        vehicleId: 'vehicle-minivan',
        vehicle: targetVehicles[1],
        minPax: 5,
        maxPax: 9,
        notes: 'Golden Touring Route Pricing Completion Phase 1: estimate',
      },
      {
        id: 'pricing-missing-large',
        touringRouteId: goldenRoute.id,
        touringRoute: goldenRoute,
        active: true,
        vehicleId: 'vehicle-coaster',
        vehicle: targetVehicles[3],
        minPax: 31,
        maxPax: 49,
        notes: 'Golden Touring Route Pricing Completion Phase 1: estimate',
      },
    ],
    quoteItems: [{ id: 'quote-1', touringRoutePricingId: 'pricing-referenced' }],
    bookingServices: [{ id: 'booking-1', touringRoutePricingId: 'pricing-referenced' }],
  });

  const summary = await correctGoldenTouringRoutePricingVehicles(prisma, { dryRun: false, logger });
  const output = logs.join('\n');

  assert.equal(summary.rowsChecked, 3);
  assert.equal(summary.candidates, 0);
  assert.equal(summary.remapped, 0);
  assert.equal(summary.skippedReferenced, 1);
  assert.equal(summary.skippedUnsupportedRange, 1);
  assert.equal(summary.skippedMissingVehicle, 1);
  assert.equal(store.touringRoutePricings.every((pricing) => pricing.vehicleId !== 'vehicle-van'), true);
  assert.match(output, /Skip referenced row/);
  assert.match(output, /Skip unsupported pax range/);
  assert.match(output, /Skip missing exact canonical vehicle/);
});
