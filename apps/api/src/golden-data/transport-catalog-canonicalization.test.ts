import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { canonicalizeTransportCatalogPhase1 } from '../../prisma/seeds/canonicalize-transport-catalog-phase1';

type Store = Record<string, any[]>;

const packageSource = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');
const scriptSource = readFileSync(join(__dirname, '..', '..', 'prisma', 'seeds', 'canonicalize-transport-catalog-phase1.ts'), 'utf8');

function matchesWhere(record: any, where: Record<string, any> = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') {
      return (value as Array<Record<string, any>>).some((clause: Record<string, any>) => matchesWhere(record, clause));
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('equals' in value) return String(record[key] || '').toLowerCase() === String(value.equals || '').toLowerCase();
      if ('startsWith' in value) return String(record[key] || '').startsWith(String(value.startsWith));
      if (key === 'route') return matchesWhere(record.route || {}, value);
      if (key === 'touringRoute') return matchesWhere(record.touringRoute || {}, value);
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
    routes: [],
    touringRoutes: [],
    vehicleRates: [],
    touringRoutePricings: [],
    transportServiceTypes: [],
    transportPricingRules: [],
    quoteItems: [],
    bookingServices: [],
    ...overrides,
  };
  const onDelete = () => {
    destructiveCalls += 1;
    throw new Error('Canonicalization must not delete records');
  };
  return {
    store,
    getDestructiveCalls: () => destructiveCalls,
    prisma: {
      route: createModel(store, 'routes', onDelete),
      touringRoute: createModel(store, 'touringRoutes', onDelete),
      vehicleRate: createModel(store, 'vehicleRates', onDelete),
      touringRoutePricing: createModel(store, 'touringRoutePricings', onDelete),
      transportPricingRule: createModel(store, 'transportPricingRules', onDelete),
      transportServiceType: createModel(store, 'transportServiceTypes', onDelete),
      quoteItem: createModel(store, 'quoteItems', onDelete),
      bookingService: createModel(store, 'bookingServices', onDelete),
    },
  };
}

const silentLogger = { log: () => undefined, warn: () => undefined };

test('transport catalog canonicalization script is dry-run first and non-destructive', () => {
  assert.match(packageSource, /"canonicalize:transport-catalog": "ts-node prisma\/seeds\/canonicalize-transport-catalog-phase1\.ts"/);
  assert.match(scriptSource, /dryRun = !process\.argv\.includes\('--apply'\)/);
  assert.doesNotMatch(scriptSource, /\.deleteMany\(/);
  assert.doesNotMatch(scriptSource, /\.delete\(/);
});

test('dry-run reports legacy route and pricing candidates without mutating records', async () => {
  const { prisma, store } = createPrismaMock({
    routes: [{ id: 'route-1', isActive: true, routeType: 'private-transfer', normalizedKey: 'AMMAN_CITY_CENTER_PETRA_VISITOR_CENTER' }],
    transportServiceTypes: [{ id: 'service-full', name: 'Day Tour', code: 'DAY_TOUR' }],
    vehicleRates: [{ id: 'rate-1', active: true, route: { isActive: true }, serviceTypeId: 'service-full', serviceType: { id: 'service-full', name: 'Day Tour', code: 'DAY_TOUR' } }],
  });

  const summary = await canonicalizeTransportCatalogPhase1(prisma, { logger: silentLogger });

  assert.equal(summary.dryRun, true);
  assert.equal(summary.routeTypeCandidates, 1);
  assert.equal(summary.pricingModeCandidates, 1);
  assert.equal(summary.metadataCandidates, 1);
  assert.equal(store.routes[0].routeType, 'private-transfer');
  assert.equal(store.vehicleRates[0].serviceTypeId, 'service-full');
});

test('apply normalizes catalog display metadata and skips referenced pricing rows', async () => {
  const { prisma, store, getDestructiveCalls } = createPrismaMock({
    routes: [
      { id: 'route-1', isActive: true, routeType: 'intercity-transfer', normalizedKey: 'AMMAN_CITY_CENTER_PETRA_VISITOR_CENTER', durationMinutes: null, distanceKm: null },
      { id: 'route-2', isActive: true, routeType: 'private-transfer', normalizedKey: 'PETRA_VISITOR_CENTER_WADI_RUM_CAMP_AREA', durationMinutes: 90, distanceKm: 100, notes: 'Existing note.' },
    ],
    touringRoutes: [
      {
        id: 'tour-1',
        active: true,
        code: 'JOR-TR-SOUTH-PETRA-WADI-RUM-ON',
        estimatedDriveHours: null,
        estimatedDistanceKm: null,
        includedHours: null,
        includedKm: null,
      },
    ],
    transportServiceTypes: [
      { id: 'service-day', name: 'Day Tour', code: 'DAY_TOUR' },
      { id: 'service-waiting', name: 'Waiting', code: 'WAITING' },
      { id: 'service-daily', name: 'Daily Full Day', code: 'DAILY_FULL_DAY' },
      { id: 'service-stationary', name: 'Stationary / Waiting', code: 'STATIONARY_WAITING' },
    ],
    vehicleRates: [
      { id: 'rate-safe', active: true, route: { isActive: true }, serviceTypeId: 'service-day', serviceType: { id: 'service-day', name: 'Day Tour', code: 'DAY_TOUR' } },
      { id: 'rate-referenced', active: true, route: { isActive: true }, serviceTypeId: 'service-waiting', serviceType: { id: 'service-waiting', name: 'Waiting', code: 'WAITING' } },
    ],
    touringRoutePricings: [
      {
        id: 'tour-price-1',
        active: true,
        touringRoute: { active: true },
        transportServiceTypeId: 'service-day',
        transportServiceType: { id: 'service-day', name: 'Full Day', code: 'FULL_DAY' },
      },
    ],
    quoteItems: [{ id: 'quote-rate', appliedVehicleRateId: 'rate-referenced' }],
  });

  const summary = await canonicalizeTransportCatalogPhase1(prisma, { dryRun: false, logger: silentLogger });

  assert.equal(summary.routeTypesUpdated, 2);
  assert.equal(summary.vehicleRatesUpdated, 1);
  assert.equal(summary.touringRoutePricingsUpdated, 1);
  assert.equal(summary.skippedReferencedPricing, 1);
  assert.equal(summary.routeMetadataUpdated, 2);
  assert.equal(summary.touringRouteMetadataUpdated, 1);
  assert.equal(store.routes[0].routeType, 'TRANSFER_ROUTE');
  assert.equal(store.routes[0].durationMinutes, 210);
  assert.equal(store.routes[0].distanceKm, 235);
  assert.equal(store.routes[1].durationMinutes, 90);
  assert.equal(store.routes[1].distanceKm, 100);
  assert.match(store.routes[1].notes, /Wadi Rum overnight or free-day/);
  assert.equal(store.vehicleRates.find((rate) => rate.id === 'rate-safe')?.serviceTypeId, 'service-daily');
  assert.equal(store.vehicleRates.find((rate) => rate.id === 'rate-referenced')?.serviceTypeId, 'service-waiting');
  assert.equal(store.touringRoutePricings[0].transportServiceTypeId, 'service-daily');
  assert.equal(store.touringRoutes[0].estimatedDriveHours, 2);
  assert.equal(store.touringRoutes[0].estimatedDistanceKm, 115);
  assert.match(store.touringRoutes[0].reviewNotes, /Pickup recommendation: 09:00/);
  assert.match(store.touringRoutes[0].reviewNotes, /Stationary \/ Waiting may apply for Wadi Rum/);
  assert.equal(getDestructiveCalls(), 0);
});

test('golden metadata preserves valid values and records Dead Sea stationary guidance conservatively', async () => {
  const { prisma, store } = createPrismaMock({
    touringRoutes: [
      {
        id: 'tour-dead-sea',
        active: true,
        code: 'JOR-TR-CENTRAL-MADABA-NEBO-DEAD-SEA-RT',
        estimatedDriveHours: 4,
        estimatedDistanceKm: 160,
        includedHours: 4,
        includedKm: 160,
      },
    ],
  });

  await canonicalizeTransportCatalogPhase1(prisma, { dryRun: false, logger: silentLogger });

  assert.equal(store.touringRoutes[0].estimatedDriveHours, 4);
  assert.equal(store.touringRoutes[0].estimatedDistanceKm, 160);
  assert.match(store.touringRoutes[0].reviewNotes, /Dead Sea day touring from Amman normally should not require Stationary \/ Waiting fees/);
});

test('dry-run missing-rate audit reports Golden route coverage gaps without blocking', async () => {
  const logs: string[] = [];
  const logger = { log: (message: unknown) => logs.push(String(message)), warn: (message: unknown) => logs.push(String(message)) };
  const { prisma } = createPrismaMock({
    routes: [
      {
        id: 'route-wadi-rum',
        isActive: true,
        routeType: 'TRANSFER_ROUTE',
        name: 'Petra Visitor Center to Wadi Rum Camp Area overnight',
        normalizedKey: 'PETRA_VISITOR_CENTER_WADI_RUM_CAMP_AREA',
        notes: 'Wadi Rum free-day vehicle hold',
      },
    ],
    touringRoutes: [
      {
        id: 'tour-aqaba-wadi-rum',
        active: true,
        code: 'JOR-TR-SOUTH-AQABA-WADI-RUM-RT',
        name: 'Aqaba - Wadi Rum - Aqaba RT',
        reviewNotes: 'Aqaba free-day operation',
      },
    ],
    vehicleRates: [
      {
        id: 'rate-no-currency',
        active: true,
        routeId: 'route-wadi-rum',
        supplierId: null,
        currency: '',
        serviceType: { name: 'Point-to-Point', code: 'POINT_TO_POINT' },
        vehicle: null,
      },
    ],
  });

  const summary = await canonicalizeTransportCatalogPhase1(prisma, { logger });

  assert.ok(summary.auditFindings >= 6);
  const output = logs.join('\n');
  assert.match(output, /Route Code \| Route Name \| Route Type \| Missing What \| Severity \| Suggested Action/);
  assert.match(output, /PETRA_VISITOR_CENTER_WADI_RUM_CAMP_AREA .* missing Stationary \/ Waiting rate/);
  assert.match(output, /JOR-TR-SOUTH-AQABA-WADI-RUM-RT .* no vehicle rates/);
  assert.match(output, /missing currency/);
  assert.match(output, /missing vehicle type coverage/);
});
