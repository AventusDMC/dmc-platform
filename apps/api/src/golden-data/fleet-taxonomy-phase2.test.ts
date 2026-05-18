import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { canonicalizeFleetTaxonomyPhase2 } from '../../prisma/seeds/canonicalize-fleet-taxonomy-phase2';

type Store = Record<string, any[]>;

const packageSource = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');
const scriptSource = readFileSync(join(__dirname, '..', '..', 'prisma', 'seeds', 'canonicalize-fleet-taxonomy-phase2.ts'), 'utf8');

function matchesWhere(record: any, where: Record<string, any> = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('equals' in value) return String(record[key] || '').toLowerCase() === String(value.equals || '').toLowerCase();
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
    vehicles: [],
    vehicleRates: [],
    touringRoutePricings: [],
    transportPricingRules: [],
    quoteItems: [],
    bookingServices: [],
    ...overrides,
  };
  const onDelete = () => {
    destructiveCalls += 1;
    throw new Error('Fleet taxonomy Phase 2 must not delete records');
  };
  return {
    store,
    getDestructiveCalls: () => destructiveCalls,
    prisma: {
      vehicle: createModel(store, 'vehicles', onDelete),
      vehicleRate: createModel(store, 'vehicleRates', onDelete),
      touringRoutePricing: createModel(store, 'touringRoutePricings', onDelete),
      transportPricingRule: createModel(store, 'transportPricingRules', onDelete),
      quoteItem: createModel(store, 'quoteItems', onDelete),
      bookingService: createModel(store, 'bookingServices', onDelete),
    },
  };
}

const silentLogger = { log: () => undefined, warn: () => undefined };
const canonicalVehicles = [
  { id: 'sedan', name: 'Sedan 2', vehicleType: 'Sedan', maxPax: 2 },
  { id: 'mini-van', name: 'Mini Van 6', vehicleType: 'Mini Van', maxPax: 6 },
  { id: 'van', name: 'Van 9', vehicleType: 'Van', maxPax: 9 },
  { id: 'coaster', name: 'Toyota Coaster / Mini Bus 17', vehicleType: 'Mini Bus', maxPax: 17 },
  { id: 'medium', name: 'Medium Bus 30', vehicleType: 'Medium Bus', maxPax: 30 },
  { id: 'large', name: 'Large Coach 49', vehicleType: 'Large Coach', maxPax: 49 },
];

test('fleet taxonomy Phase 2 is dry-run first and non-destructive', () => {
  assert.match(packageSource, /"canonicalize:fleet-taxonomy": "ts-node prisma\/seeds\/canonicalize-fleet-taxonomy-phase2\.ts"/);
  assert.match(scriptSource, /dryRun = !process\.argv\.includes\('--apply'\)/);
  assert.match(scriptSource, /Quote items and bookings will not be updated/);
  assert.match(scriptSource, /No fleet taxonomy changes required/);
  assert.match(scriptSource, /Golden Touring Route Pricing Completion Phase 1/);
  assert.doesNotMatch(scriptSource, /\.deleteMany\(/);
  assert.doesNotMatch(scriptSource, /\.delete\(/);
  assert.doesNotMatch(scriptSource, /vehicleRate\.update/);
  assert.doesNotMatch(scriptSource, /transportPricingRule\.update/);
  assert.doesNotMatch(scriptSource, /quoteItem\.update/);
  assert.doesNotMatch(scriptSource, /bookingService\.update/);
});

test('dry-run reports grouped canonical creation and Golden touring pricing remaps without mutating', async () => {
  const logs: string[] = [];
  const logger = { log: (message: unknown) => logs.push(String(message)), warn: (message: unknown) => logs.push(String(message)) };
  const { prisma, store } = createPrismaMock({
    vehicles: [
      { id: 'sedan', name: 'Sedan 2', vehicleType: 'Sedan', maxPax: 2 },
      { id: 'legacy-van', name: 'Van 12', vehicleType: 'Van', maxPax: 9 },
    ],
    vehicleRates: [
      { id: 'rate-1', vehicleId: 'legacy-van', vehicle: { id: 'legacy-van', name: 'Van 12', vehicleType: 'Van', maxPax: 9 }, active: true, routeName: 'A-B', minPax: 1, maxPax: 9 },
    ],
    touringRoutePricings: [
      {
        id: 'tour-price-1',
        vehicleId: 'legacy-van',
        vehicle: { id: 'legacy-van', name: 'Van 12', vehicleType: 'Van', maxPax: 9 },
        active: true,
        notes: 'Golden Touring Route Pricing Completion Phase 1: estimate',
      },
      {
        id: 'tour-price-legacy',
        vehicleId: 'legacy-van',
        vehicle: { id: 'legacy-van', name: 'Van 12', vehicleType: 'Van', maxPax: 9 },
        active: true,
        notes: 'Legacy supplier row',
      },
    ],
  });

  const summary = await canonicalizeFleetTaxonomyPhase2(prisma, { logger });

  assert.equal(summary.dryRun, true);
  assert.equal(summary.vehiclesChecked, 2);
  assert.equal(summary.canonicalRowsFound, 1);
  assert.ok(summary.candidates > 0);
  assert.ok(summary.unreferencedRemapCandidates > 0);
  assert.ok(summary.createReplacementCandidates > 0);
  assert.equal(summary.canonicalVehiclesCreated, 0);
  assert.equal(store.vehicleRates[0].vehicleId, 'legacy-van');
  assert.equal(store.touringRoutePricings[0].vehicleId, 'legacy-van');
  assert.match(logs.join('\n'), /Canonical Vehicle \| Current Matched Rows \| Action \| Count/);
  assert.match(logs.join('\n'), /Van 9 \| 1 \| Remap unreferenced Golden touringRoutePricing rows \| 1/);
  assert.doesNotMatch(logs.join('\n'), /Legacy supplier row/);
  assert.match(logs.join('\n'), /"vehiclesChecked": 2/);
  assert.match(logs.join('\n'), /"canonicalRowsFound": 1/);
  assert.match(logs.join('\n'), /"candidates":/);
  assert.match(logs.join('\n'), /"referencedPreserved":/);
  assert.match(logs.join('\n'), /"unreferencedRemapCandidates":/);
  assert.match(logs.join('\n'), /"retireCandidates":/);
  assert.match(logs.join('\n'), /"createReplacementCandidates":/);
  assert.match(logs.join('\n'), /"noAction":/);
});

test('dry-run prints explicit no-change message and required summary counts when canonical fleet is clean', async () => {
  const logs: string[] = [];
  const logger = { log: (message: unknown) => logs.push(String(message)), warn: (message: unknown) => logs.push(String(message)) };
  const { prisma } = createPrismaMock({ vehicles: canonicalVehicles });

  const summary = await canonicalizeFleetTaxonomyPhase2(prisma, { logger });
  const output = logs.join('\n');

  assert.equal(summary.vehiclesChecked, 6);
  assert.equal(summary.canonicalRowsFound, 6);
  assert.equal(summary.candidates, 0);
  assert.equal(summary.noAction, 6);
  assert.match(output, /Canonical Vehicle \| Current Matched Rows \| Action \| Count/);
  assert.match(output, /No fleet taxonomy changes required\./);
  assert.match(output, /"vehiclesChecked": 6/);
  assert.match(output, /"canonicalRowsFound": 6/);
  assert.match(output, /"candidates": 0/);
  assert.match(output, /"referencedPreserved": 0/);
  assert.match(output, /"unreferencedRemapCandidates": 0/);
  assert.match(output, /"retireCandidates": 0/);
  assert.match(output, /"createReplacementCandidates": 0/);
  assert.match(output, /"noAction": 6/);
});

test('apply remaps only unreferenced Golden touring pricing rows to canonical vehicle rows', async () => {
  const { prisma, store, getDestructiveCalls } = createPrismaMock({
    vehicles: [
      { id: 'van-canonical', name: 'Van 9', vehicleType: 'Van', maxPax: 9 },
      { id: 'van-legacy', name: 'Van 12', vehicleType: 'Van', maxPax: 9 },
    ],
    vehicleRates: [
      { id: 'rate-1', vehicleId: 'van-legacy', vehicle: { id: 'van-legacy', name: 'Van 12', vehicleType: 'Van', maxPax: 9 }, serviceTypeId: 'service-1', supplierId: null, routeId: 'route-1', routeName: 'A-B', minPax: 1, maxPax: 9, active: true },
    ],
    touringRoutePricings: [
      {
        id: 'tour-price-1',
        vehicleId: 'van-legacy',
        vehicle: { id: 'van-legacy', name: 'Van 12', vehicleType: 'Van', maxPax: 9 },
        touringRouteId: 'tour-1',
        supplierId: null,
        transportServiceTypeId: null,
        pricingBasis: 'PER_VEHICLE',
        minPax: 1,
        maxPax: 9,
        active: true,
        notes: 'Golden Touring Route Pricing Completion Phase 1: estimate',
      },
      {
        id: 'tour-price-non-golden',
        vehicleId: 'van-legacy',
        vehicle: { id: 'van-legacy', name: 'Van 12', vehicleType: 'Van', maxPax: 9 },
        touringRouteId: 'tour-2',
        active: true,
        notes: 'Supplier legacy row',
      },
    ],
    transportPricingRules: [
      { id: 'rule-1', vehicleId: 'van-legacy', vehicle: { id: 'van-legacy', name: 'Van 12', vehicleType: 'Van', maxPax: 9 }, routeId: 'route-1', transportServiceTypeId: 'service-1', supplierId: null, pricingMode: 'FIXED', minPax: 1, maxPax: 9, isActive: true },
    ],
  });

  const summary = await canonicalizeFleetTaxonomyPhase2(prisma, { dryRun: false, logger: silentLogger });

  assert.equal(summary.pricingRowsRemapped, 1);
  assert.equal(store.vehicleRates[0].vehicleId, 'van-legacy');
  assert.equal(store.touringRoutePricings[0].vehicleId, 'van-canonical');
  assert.equal(store.touringRoutePricings[1].vehicleId, 'van-legacy');
  assert.equal(store.transportPricingRules[0].vehicleId, 'van-legacy');
  assert.equal(getDestructiveCalls(), 0);
});

test('apply skips referenced Golden touring pricing and does not retire referenced pricing', async () => {
  const { prisma, store } = createPrismaMock({
    vehicles: [
      { id: 'coaster-canonical', name: 'Toyota Coaster / Mini Bus 17', vehicleType: 'Mini Bus', maxPax: 17 },
      { id: 'coaster-legacy', name: 'Mini Coach', vehicleType: 'Mini Bus', maxPax: 17 },
    ],
    vehicleRates: [
      { id: 'rate-legacy', vehicleId: 'coaster-legacy', vehicle: { id: 'coaster-legacy', name: 'Mini Coach', vehicleType: 'Mini Bus', maxPax: 17 }, serviceTypeId: 'service-1', supplierId: null, routeId: 'route-1', routeName: 'A-B', minPax: 10, maxPax: 17, price: 100, currency: 'USD', active: true, notes: null },
    ],
    touringRoutePricings: [
      {
        id: 'tour-price-legacy',
        vehicleId: 'coaster-legacy',
        vehicle: { id: 'coaster-legacy', name: 'Mini Coach', vehicleType: 'Mini Bus', maxPax: 17 },
        touringRouteId: 'tour-1',
        supplierId: null,
        transportServiceTypeId: null,
        pricingBasis: 'PER_VEHICLE',
        minPax: 10,
        maxPax: 17,
        baseCost: 100,
        currency: 'USD',
        active: true,
        notes: 'Golden Touring Route Pricing Completion Phase 1: estimate',
      },
    ],
    quoteItems: [
      { id: 'quote-rate', appliedVehicleRateId: 'rate-legacy', vehicleId: 'coaster-legacy' },
      { id: 'quote-tour', touringRoutePricingId: 'tour-price-legacy' },
    ],
    bookingServices: [{ id: 'booking-tour', touringRoutePricingId: 'tour-price-legacy', vehicleId: 'coaster-legacy' }],
  });

  const summary = await canonicalizeFleetTaxonomyPhase2(prisma, { dryRun: false, logger: silentLogger });

  assert.equal(summary.pricingRowsRetired, 0);
  assert.equal(summary.pricingRowsCreated, 0);
  assert.equal(summary.pricingRowsRemapped, 0);
  assert.equal(summary.referencedPreserved, 1);
  assert.equal(store.vehicleRates.find((rate) => rate.id === 'rate-legacy')?.active, true);
  assert.equal(store.touringRoutePricings.find((pricing) => pricing.id === 'tour-price-legacy')?.active, true);
  assert.equal(store.touringRoutePricings.find((pricing) => pricing.id === 'tour-price-legacy')?.vehicleId, 'coaster-legacy');
  assert.equal(store.quoteItems[0].vehicleId, 'coaster-legacy');
  assert.equal(store.bookingServices[0].vehicleId, 'coaster-legacy');
});

test('apply creates missing canonical vehicle rows without renaming matched legacy rows', async () => {
  const { prisma, store } = createPrismaMock({
    vehicles: [{ id: 'van-legacy', name: 'Van 12', vehicleType: 'Van', maxPax: 9 }],
  });

  const summary = await canonicalizeFleetTaxonomyPhase2(prisma, { dryRun: false, logger: silentLogger });

  assert.equal(summary.canonicalVehiclesCreated, 6);
  assert.equal(store.vehicles.some((vehicle) => vehicle.id === 'van-legacy' && vehicle.name === 'Van 12'), true);
  assert.equal(store.vehicles.some((vehicle) => vehicle.name === 'Van 9'), true);
});
