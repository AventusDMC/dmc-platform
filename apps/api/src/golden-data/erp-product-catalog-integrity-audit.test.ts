import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { auditErpProductCatalogIntegrity } from '../../prisma/seeds/audit-erp-product-catalog-integrity';

type Store = Record<string, any[]>;

const packageSource = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');
const scriptSource = readFileSync(join(__dirname, '..', '..', 'prisma', 'seeds', 'audit-erp-product-catalog-integrity.ts'), 'utf8');

function createReadOnlyModel(store: Store, key: string, onMutation: () => never) {
  return {
    findMany: async () => store[key],
    findFirst: async () => store[key][0] || null,
    count: async () => store[key].length,
    create: onMutation,
    update: onMutation,
    updateMany: onMutation,
    delete: onMutation,
    deleteMany: onMutation,
  };
}

function createPrismaMock(overrides: Partial<Store> = {}) {
  let mutationCalls = 0;
  const store: Store = {
    places: [],
    routes: [],
    touringRoutes: [],
    vehicles: [],
    vehicleRates: [],
    transportPricingRules: [],
    ...overrides,
  };
  const onMutation = (): never => {
    mutationCalls += 1;
    throw new Error('ERP product catalog audit must not mutate data');
  };

  return {
    getMutationCalls: () => mutationCalls,
    prisma: {
      place: createReadOnlyModel(store, 'places', onMutation),
      route: createReadOnlyModel(store, 'routes', onMutation),
      touringRoute: createReadOnlyModel(store, 'touringRoutes', onMutation),
      vehicle: createReadOnlyModel(store, 'vehicles', onMutation),
      vehicleRate: createReadOnlyModel(store, 'vehicleRates', onMutation),
      transportPricingRule: createReadOnlyModel(store, 'transportPricingRules', onMutation),
    },
  };
}

const canonicalVehicles = [
  { id: 'sedan', name: 'Sedan 2', maxPax: 2 },
  { id: 'mini-van', name: 'Mini Van 6', maxPax: 6 },
  { id: 'van', name: 'Van 9', maxPax: 9 },
  { id: 'coaster', name: 'Toyota Coaster / Mini Bus 17', maxPax: 17 },
  { id: 'medium-bus', name: 'Medium Bus 30', maxPax: 30 },
  { id: 'large-coach', name: 'Large Coach 49', maxPax: 49 },
];

test('ERP product catalog audit script is registered and read-only', () => {
  assert.match(packageSource, /"audit:erp-product-catalog": "ts-node prisma\/seeds\/audit-erp-product-catalog-integrity\.ts"/);
  assert.doesNotMatch(scriptSource, /\.create\(/);
  assert.doesNotMatch(scriptSource, /\.update\(/);
  assert.doesNotMatch(scriptSource, /\.updateMany\(/);
  assert.doesNotMatch(scriptSource, /\.delete\(/);
  assert.doesNotMatch(scriptSource, /\.deleteMany\(/);
});

test('ERP product catalog audit prints boundary findings without mutating records', async () => {
  const logs: string[] = [];
  const logger = { log: (message: unknown) => logs.push(String(message)), warn: (message: unknown) => logs.push(String(message)) };
  const legacyVehicle = { id: 'legacy-van', name: 'Mini Van 6', maxPax: 9 };
  const { prisma, getMutationCalls } = createPrismaMock({
    places: [
      { id: 'place-amman', name: 'Amman', type: 'City', isActive: true },
      { id: 'place-bad', name: 'Stationary Waiting', type: 'Pricing Mode', isActive: true },
    ],
    routes: [
      {
        id: 'route-transfer',
        name: 'QAIA to Amman',
        routeType: 'TRANSFER_ROUTE',
        fromPlaceId: 'qaia',
        toPlaceId: 'amman',
        fromPlace: { id: 'qaia', name: 'QAIA', city: 'Amman' },
        toPlace: { id: 'amman', name: 'Amman', city: 'Amman' },
      },
      {
        id: 'route-tour',
        name: 'Petra Full Day Tour',
        routeType: 'TOURING_ROUTE',
        fromPlaceId: 'amman',
        toPlaceId: 'petra',
        fromPlace: { id: 'amman', name: 'Amman', city: 'Amman' },
        toPlace: { id: 'petra', name: 'Petra', city: 'Petra' },
      },
      {
        id: 'route-disposal',
        name: 'Amman City Disposal',
        routeType: 'TRANSFER_ROUTE',
        fromPlaceId: 'amman',
        toPlaceId: 'amman',
        fromPlace: { id: 'amman', name: 'Amman', city: 'Amman' },
        toPlace: { id: 'amman', name: 'Amman', city: 'Amman' },
      },
    ],
    touringRoutes: [
      {
        id: 'tour-bad-code',
        code: 'PETRA-FD',
        name: 'Petra Full Day Sightseeing',
        active: true,
        durationDays: null,
        includedKm: null,
        estimatedDistanceKm: null,
        stops: [],
        pricings: [{ id: 'tour-price', vehicle: legacyVehicle, transportServiceType: { name: 'Daily Full Day' } }],
      },
    ],
    vehicles: [...canonicalVehicles, legacyVehicle],
    vehicleRates: [
      {
        id: 'rate-disposal-on-transfer',
        active: true,
        routeName: 'Stationary Waiting',
        routeId: 'route-transfer',
        route: {
          id: 'route-transfer',
          name: 'QAIA to Amman',
          routeType: 'TRANSFER_ROUTE',
          fromPlaceId: 'qaia',
          toPlaceId: 'amman',
          fromPlace: { id: 'qaia', name: 'QAIA', city: 'Amman' },
          toPlace: { id: 'amman', name: 'Amman', city: 'Amman' },
        },
        serviceType: { name: 'Stationary / Waiting', code: 'STATIONARY_WAITING' },
        vehicle: legacyVehicle,
      },
    ],
    transportPricingRules: [{ id: 'rule-1', vehicle: legacyVehicle, route: { id: 'route-transfer', name: 'QAIA to Amman' } }],
  });

  const result = await auditErpProductCatalogIntegrity(prisma, { logger });

  assert.equal(getMutationCalls(), 0);
  assert.ok(result.summary.findings >= 8);
  const output = logs.join('\n');
  assert.match(output, /Area \| Problem \| Example \| Severity \| Suggested Fix/);
  assert.match(output, /Place selectors \| Active place looks like a supplier service, rate, or pricing mode/);
  assert.match(output, /Transfer Routes \| Route table contains a non-transfer active route/);
  assert.match(output, /Disposal \/ Stationary \| Disposal\/stationary supplier rate is attached to a movement route/);
  assert.match(output, /Touring Routes \| Active touring route code does not use JOR-TR prefix/);
  assert.match(output, /Vehicle selectors \| Active transport pricing points at non-canonical vehicle/);
  assert.match(output, /Quote transport drawer \| Transfer mode source includes touring or disposal candidates/);
});

test('ERP product catalog audit reports no findings for separated canonical transport data', async () => {
  const logs: string[] = [];
  const logger = { log: (message: unknown) => logs.push(String(message)), warn: (message: unknown) => logs.push(String(message)) };
  const { prisma, getMutationCalls } = createPrismaMock({
    places: [
      { id: 'qaia', name: 'QAIA', type: 'Airport', isActive: true },
      { id: 'amman', name: 'Amman', type: 'City', isActive: true },
    ],
    routes: [
      {
        id: 'route-transfer',
        name: 'QAIA to Amman',
        routeType: 'TRANSFER_ROUTE',
        fromPlaceId: 'qaia',
        toPlaceId: 'amman',
        fromPlace: { id: 'qaia', name: 'QAIA', city: 'Amman' },
        toPlace: { id: 'amman', name: 'Amman', city: 'Amman' },
      },
    ],
    touringRoutes: [
      {
        id: 'tour-jerash',
        code: 'JOR-TR-NORTH-JERASH-RT',
        name: 'Jerash Full Day Sightseeing',
        active: true,
        durationDays: 1,
        includedKm: 105,
        estimatedDistanceKm: 105,
        stops: [{ id: 'stop-1', city: 'Jerash', order: 1 }],
        pricings: [{ id: 'tour-price', vehicle: canonicalVehicles[2], transportServiceType: { name: 'Daily Full Day' } }],
      },
    ],
    vehicles: canonicalVehicles,
    vehicleRates: [],
    transportPricingRules: [{ id: 'rule-1', vehicle: canonicalVehicles[0], route: { id: 'route-transfer', name: 'QAIA to Amman' } }],
  });

  const result = await auditErpProductCatalogIntegrity(prisma, { logger });

  assert.equal(getMutationCalls(), 0);
  assert.equal(result.summary.findings, 0);
  assert.match(logs.join('\n'), /No ERP product catalog integrity findings/);
});
