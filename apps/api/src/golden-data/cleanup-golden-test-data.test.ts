import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cleanupGoldenTestData } from '../../prisma/seeds/cleanup-golden-test-data';

type Store = Record<string, any[]>;

const packageSource = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');
const rootPackageSource = readFileSync(join(__dirname, '..', '..', '..', '..', 'package.json'), 'utf8');
const cleanupSource = readFileSync(join(__dirname, '..', '..', 'prisma', 'seeds', 'cleanup-golden-test-data.ts'), 'utf8');

function matchesWhere(record: any, where: Record<string, any> = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('not' in value) return record[key] !== value.not;
      if ('in' in value) return value.in.includes(record[key]);
      if ('notIn' in value) return !value.notIn.includes(record[key]);
      return true;
    }
    return record[key] === value;
  });
}

function createModel(store: Store, key: string, onDelete: () => void) {
  return {
    findMany: async ({ where }: any = {}) => store[key].filter((record) => matchesWhere(record, where)),
    count: async ({ where }: any = {}) => store[key].filter((record) => matchesWhere(record, where)).length,
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
    activities: [],
    activityRateVariants: [],
    excursionTemplates: [],
    packageTemplates: [],
    supplierServices: [],
    transportPricingRules: [],
    touringRoutePricings: [],
    quoteItems: [],
    vehicleRates: [],
    packageTemplateComponents: [],
    excursionTemplateComponents: [],
    bookingServices: [],
    quoteBlocks: [],
    series: [],
    ...overrides,
  };
  const onDelete = () => {
    destructiveCalls += 1;
    throw new Error('Cleanup must not delete records');
  };
  const prisma = {
    route: createModel(store, 'routes', onDelete),
    touringRoute: createModel(store, 'touringRoutes', onDelete),
    activity: createModel(store, 'activities', onDelete),
    activityRateVariant: createModel(store, 'activityRateVariants', onDelete),
    excursionTemplate: createModel(store, 'excursionTemplates', onDelete),
    packageTemplate: createModel(store, 'packageTemplates', onDelete),
    supplierService: createModel(store, 'supplierServices', onDelete),
    transportPricingRule: createModel(store, 'transportPricingRules', onDelete),
    touringRoutePricing: createModel(store, 'touringRoutePricings', onDelete),
    quoteItem: createModel(store, 'quoteItems', onDelete),
    vehicleRate: createModel(store, 'vehicleRates', onDelete),
    packageTemplateComponent: createModel(store, 'packageTemplateComponents', onDelete),
    excursionTemplateComponent: createModel(store, 'excursionTemplateComponents', onDelete),
    bookingService: createModel(store, 'bookingServices', onDelete),
    quoteBlock: createModel(store, 'quoteBlocks', onDelete),
    series: createModel(store, 'series', onDelete),
  };
  return { prisma, store, getDestructiveCalls: () => destructiveCalls };
}

const silentLogger = { log: () => undefined, warn: () => undefined };

test('golden cleanup script is exposed as an admin-safe npm script', () => {
  assert.match(packageSource, /"cleanup:golden-test-data": "ts-node prisma\/seeds\/cleanup-golden-test-data\.ts"/);
  assert.match(rootPackageSource, /"cleanup:golden-test-data": "npm --workspace @dmc\/api run cleanup:golden-test-data"/);
  assert.match(cleanupSource, /No records will be deleted/);
  assert.doesNotMatch(cleanupSource, /\.deleteMany\(/);
  assert.doesNotMatch(cleanupSource, /\.delete\(/);
});

test('golden cleanup keeps Golden Jordan records active', async () => {
  const { prisma, store } = createPrismaMock({
    routes: [{ id: 'route-golden', normalizedKey: 'QUEEN_ALIA_INTERNATIONAL_AIRPORT_AMMAN_CITY_CENTER', name: 'QAIA to Amman', isActive: true }],
    touringRoutes: [
      { id: 'tour-golden', code: 'JOR-TR-NORTH-JERASH-AJLOUN-RT', name: 'Amman - Jerash - Ajloun - Amman RT', active: true },
      { id: 'tour-golden-new', code: 'JOR-TR-NEW-CANONICAL-RT', name: 'New canonical Golden route', active: true },
    ],
    activities: [
      { id: 'activity-golden', code: 'ACT-JERASH-GUIDED-EXPERIENCES', name: 'Jerash Guided Experiences', active: true },
      { id: 'activity-petra-hiking', code: 'ACT-PETRA-HIKING-EXPERIENCES', name: 'Petra Hiking Experiences', active: true },
    ],
    activityRateVariants: [
      { id: 'variant-golden', name: 'Old label but canonical parent', notes: 'legacy wording', active: true, activity: { code: 'ACT-PETRA-HIKING-EXPERIENCES' } },
    ],
    excursionTemplates: [
      { id: 'excursion-golden', code: 'JERASH_AJLOUN_FULL_DAY', name: 'Jerash & Ajloun Full Day', active: true },
      { id: 'excursion-wadi-rum-full-day', code: 'WADI_RUM_FULL_DAY', name: 'Wadi Rum Full Day', active: true },
    ],
    packageTemplates: [{ id: 'program-golden', code: 'PROGRAM-CLASSIC-JORDAN-8D7N', name: 'Classic Jordan 8D7N Program Template', active: true }],
  });

  const summary = await cleanupGoldenTestData(prisma, { logger: silentLogger });

  assert.equal(summary.archivedRoutes, 0);
  assert.equal(summary.archivedTouringRoutes, 0);
  assert.equal(summary.archivedActivities, 0);
  assert.equal(summary.archivedActivityRateVariants, 0);
  assert.equal(summary.archivedExcursionTemplates, 0);
  assert.equal(summary.archivedPackageTemplates, 0);
  assert.equal(summary.protectedCanonical, 9);
  assert.equal(store.routes[0].isActive, true);
  assert.equal(store.touringRoutes[0].active, true);
  assert.equal(store.touringRoutes[1].active, true);
  assert.equal(store.activities[0].active, true);
  assert.equal(store.activities[1].active, true);
  assert.equal(store.activityRateVariants[0].active, true);
  assert.equal(store.excursionTemplates[0].active, true);
  assert.equal(store.excursionTemplates[1].active, true);
  assert.equal(store.packageTemplates[0].active, true);
});

test('golden cleanup skips legacy records referenced by quotes bookings or invoices', async () => {
  const { prisma, store } = createPrismaMock({
    routes: [{ id: 'route-referenced', normalizedKey: 'LEGACY_TEST_ROUTE', name: 'Legacy test route', isActive: true }],
    touringRoutes: [{ id: 'tour-referenced', code: 'LEGACY_TOUR', name: 'Legacy duplicate touring route', active: true }],
    activities: [{ id: 'activity-referenced', code: 'LEGACY_ACTIVITY', name: 'Legacy mixed activity', active: true }],
    supplierServices: [{ id: 'service-referenced', name: 'Unmatched demo service', category: 'Demo' }],
    quoteItems: [
      { id: 'quote-route', routeId: 'route-referenced' },
      { id: 'quote-tour', touringRouteId: 'tour-referenced' },
      { id: 'quote-activity', activityId: 'activity-referenced' },
      { id: 'quote-service', serviceId: 'service-referenced' },
    ],
  });

  const summary = await cleanupGoldenTestData(prisma, { logger: silentLogger });

  assert.equal(summary.skippedReferenced, 4);
  assert.equal(summary.referenced, 4);
  assert.equal(store.routes[0].isActive, true);
  assert.equal(store.touringRoutes[0].active, true);
  assert.equal(store.activities[0].active, true);
  assert.equal(store.supplierServices[0].category, 'Demo');
});

test('golden cleanup preserves legacy touring routes with template quote or pricing dependencies', async () => {
  const { prisma, store } = createPrismaMock({
    touringRoutes: [
      { id: 'tour-quote', code: 'LEGACY_TOUR_QUOTE', name: 'Legacy test touring route with quote', active: true },
      { id: 'tour-excursion', code: 'LEGACY_TOUR_EXCURSION', name: 'Legacy test touring route with excursion', active: true },
      { id: 'tour-package', code: 'LEGACY_TOUR_PACKAGE', name: 'Legacy test touring route with package', active: true },
      { id: 'tour-pricing', code: 'LEGACY_TOUR_PRICING', name: 'Legacy test touring route with pricing', active: true },
      { id: 'tour-zero', code: 'LEGACY_TOUR_ZERO', name: 'Legacy test touring route with zero dependencies', active: true },
    ],
    quoteItems: [{ id: 'quote-tour', touringRouteId: 'tour-quote' }],
    excursionTemplateComponents: [{ id: 'excursion-component', touringRouteId: 'tour-excursion', active: true }],
    packageTemplateComponents: [{ id: 'package-component', touringRouteId: 'tour-package', active: true }],
    touringRoutePricings: [{ id: 'touring-pricing', touringRouteId: 'tour-pricing', active: true }],
  });

  const summary = await cleanupGoldenTestData(prisma, { logger: silentLogger });

  assert.equal(summary.archivedTouringRoutes, 1);
  assert.equal(summary.referenced, 4);
  assert.equal(store.touringRoutes.find((route) => route.id === 'tour-quote')?.active, true);
  assert.equal(store.touringRoutes.find((route) => route.id === 'tour-excursion')?.active, true);
  assert.equal(store.touringRoutes.find((route) => route.id === 'tour-package')?.active, true);
  assert.equal(store.touringRoutes.find((route) => route.id === 'tour-pricing')?.active, true);
  assert.equal(store.touringRoutes.find((route) => route.id === 'tour-zero')?.active, false);
});

test('golden cleanup archives zero-reference legacy records without deleting', async () => {
  const { prisma, store, getDestructiveCalls } = createPrismaMock({
    routes: [{ id: 'route-legacy', normalizedKey: 'LEGACY_TEST_ROUTE', name: 'Legacy test route', isActive: true }],
    touringRoutes: [{ id: 'tour-legacy', code: 'LEGACY_TOUR', name: 'Legacy duplicate touring route', reviewNotes: 'Review duplicate/similar legacy touring route', active: true }],
    activities: [{ id: 'activity-legacy', code: 'LEGACY_ACTIVITY', name: 'Old mixed activity row', reviewNotes: 'Legacy duplicate', active: true }],
    activityRateVariants: [{ id: 'variant-legacy', name: 'Legacy variant', notes: 'old test mode', active: true, activity: { code: 'LEGACY_ACTIVITY', name: 'Old mixed activity row' } }],
    excursionTemplates: [{ id: 'excursion-legacy', code: 'LEGACY_EXCURSION', name: 'Old demo excursion', active: true }],
    packageTemplates: [{ id: 'program-legacy', code: 'LEGACY_PROGRAM', name: 'Demo old program', active: true }],
    supplierServices: [{ id: 'service-legacy', name: 'Placeholder unmatched demo service', category: 'Demo' }],
    transportPricingRules: [{ id: 'transport-rule-legacy', pricingMode: 'LEGACY_MODE', isActive: true, route: { normalizedKey: 'LEGACY_TEST_ROUTE', name: 'Legacy route' } }],
    touringRoutePricings: [{ id: 'tour-pricing-legacy', notes: 'legacy pricing mode', active: true, touringRoute: { code: 'LEGACY_TOUR', name: 'Legacy duplicate touring route' } }],
  });

  const summary = await cleanupGoldenTestData(prisma, { logger: silentLogger });

  assert.equal(summary.archivedRoutes, 1);
  assert.equal(summary.archivedTouringRoutes, 1);
  assert.equal(summary.archivedActivities, 1);
  assert.equal(summary.archivedActivityRateVariants, 1);
  assert.equal(summary.archivedExcursionTemplates, 1);
  assert.equal(summary.archivedPackageTemplates, 1);
  assert.equal(summary.archivedSupplierServices, 1);
  assert.equal(summary.archivedTransportPricingRules, 1);
  assert.equal(summary.archivedTouringRoutePricings, 1);
  assert.equal(summary.zeroReferenceLegacy, 9);
  assert.equal(store.routes[0].isActive, false);
  assert.equal(store.touringRoutes[0].active, false);
  assert.equal(store.activities[0].active, false);
  assert.equal(store.activityRateVariants[0].active, false);
  assert.equal(store.excursionTemplates[0].active, false);
  assert.equal(store.packageTemplates[0].active, false);
  assert.equal(store.supplierServices[0].category, 'Archived Legacy');
  assert.match(store.supplierServices[0].name, /^\[ARCHIVED\]/);
  assert.equal(store.transportPricingRules[0].isActive, false);
  assert.equal(store.touringRoutePricings[0].active, false);
  assert.equal(getDestructiveCalls(), 0);
});

test('golden cleanup protects transport pricing linked to active routes templates quotes or supplier rate cards', async () => {
  const { prisma, store } = createPrismaMock({
    routes: [{ id: 'route-active', normalizedKey: 'LEGACY_TEST_ROUTE', name: 'Legacy test route', isActive: true }],
    transportPricingRules: [
      {
        id: 'transport-rule-active-route',
        routeId: 'route-active',
        vehicleId: 'vehicle-1',
        transportServiceTypeId: 'service-type-1',
        pricingMode: 'LEGACY_MODE',
        isActive: true,
        route: { id: 'route-active', normalizedKey: 'LEGACY_TEST_ROUTE', name: 'Legacy test route', isActive: true },
      },
      {
        id: 'transport-rule-rate-card',
        routeId: 'route-rate-card',
        vehicleId: 'vehicle-1',
        transportServiceTypeId: 'service-type-1',
        pricingMode: 'LEGACY_MODE',
        isActive: true,
        route: { id: 'route-rate-card', normalizedKey: 'LEGACY_RATE_CARD_ROUTE', name: 'Legacy rate card route', isActive: false },
      },
      {
        id: 'transport-rule-zero-reference',
        routeId: 'route-zero-reference',
        vehicleId: 'vehicle-2',
        transportServiceTypeId: 'service-type-1',
        pricingMode: 'LEGACY_MODE',
        isActive: true,
        route: { id: 'route-zero-reference', normalizedKey: 'LEGACY_ZERO_REFERENCE_ROUTE', name: 'Legacy zero reference route', isActive: false },
      },
    ],
    vehicleRates: [
      {
        id: 'vehicle-rate-active',
        routeId: 'route-rate-card',
        vehicleId: 'vehicle-1',
        serviceTypeId: 'service-type-1',
        active: true,
      },
    ],
  });

  const summary = await cleanupGoldenTestData(prisma, { logger: silentLogger });

  assert.equal(summary.archivedTransportPricingRules, 1);
  assert.equal(summary.referenced, 3);
  assert.equal(store.transportPricingRules[0].isActive, true);
  assert.equal(store.transportPricingRules[1].isActive, true);
  assert.equal(store.transportPricingRules[2].isActive, false);
});
