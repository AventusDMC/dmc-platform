import test = require('node:test');
import assert = require('node:assert/strict');
import {
  JORDAN_TRANSFER_ROUTES,
  seedJordanTransferRouteLibrary,
  type JordanTransferPlace,
  type JordanTransferRoute,
} from './jordan-transfer-route-library';

const placeId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function place(name: string): JordanTransferPlace {
  return { id: placeId(name), name, country: 'Jordan', type: 'Operational Point', isActive: true };
}

function places(names: string[]) {
  return names.map(place);
}

function logger() {
  const lines: string[] = [];
  return {
    lines,
    log: (line: string) => lines.push(line),
    warn: (line: string) => lines.push(line),
    error: (line: string) => lines.push(line),
  };
}

function fakePrisma(options: { places: JordanTransferPlace[]; existingRoutes?: JordanTransferRoute[] }) {
  const creates: any[] = [];
  const updates: any[] = [];
  const routes = [...(options.existingRoutes || [])];
  return {
    creates,
    updates,
    routes,
    place: {
      findMany: async () => options.places,
    },
    route: {
      findMany: async () => routes,
      create: async (args: any) => {
        if (routes.some((route) => route.normalizedKey === args.data.normalizedKey)) {
          const error = new Error('Unique constraint failed on Route.normalizedKey') as Error & { code?: string };
          error.code = 'P2002';
          throw error;
        }
        creates.push(args);
        const created = { id: `route-${routes.length + 1}`, ...args.data };
        routes.push(created);
        return created;
      },
      update: async (args: any) => {
        updates.push(args);
        const index = routes.findIndex((route) => route.id === args.where.id);
        const updated = { ...(index >= 0 ? routes[index] : { id: args.where.id }), ...args.data };
        if (index >= 0) routes[index] = updated;
        return updated;
      },
    },
  };
}

test('Jordan transfer route library is bidirectional and transfer-only', async () => {
  const qaiaToAmman = JORDAN_TRANSFER_ROUTES.find((route) => route.from === 'qaia-airport' && route.to === 'amman');
  const ammanToQaia = JORDAN_TRANSFER_ROUTES.find((route) => route.from === 'amman' && route.to === 'qaia-airport');

  assert.ok(qaiaToAmman);
  assert.ok(ammanToQaia);

  const log = logger();
  const prisma = fakePrisma({
    places: places(['Queen Alia International Airport', 'Amman City Center']),
  });

  await seedJordanTransferRouteLibrary(prisma, { dryRun: false, logger: log });

  assert.ok(prisma.creates.length >= 2);
  assert.equal(prisma.creates[0].data.routeType, 'TRANSFER_ROUTE');
  assert.equal(prisma.creates[0].data.isActive, true);
  assert.match(prisma.creates[0].data.notes, /Route code: JOR-TRF-/);
  assert.equal((prisma as any).touringRoute, undefined);
  assert.equal((prisma as any).quoteItem, undefined);
});

test('Jordan transfer route seed defaults to dry-run and does not write', async () => {
  const log = logger();
  const prisma = fakePrisma({
    places: places(['Queen Alia International Airport', 'Amman City Center']),
  });

  const result = await seedJordanTransferRouteLibrary(prisma, { logger: log });

  assert.equal(result.dryRun, true);
  assert.equal(prisma.creates.length, 0);
  assert.equal(prisma.updates.length, 0);
  assert.ok(log.lines[0].startsWith('Route Code | From | To | DistanceKm | DurationMinutes | Action'));
  assert.ok(log.lines.some((line) => line.includes('JOR-TRF-QAIA-AMM | QAIA Airport | Amman | 35 | 45 | CREATE')));
});

test('Jordan transfer route seed resolves canonical seeded place aliases', async () => {
  const log = logger();
  const prisma = fakePrisma({
    places: places(['Queen Alia International Airport', 'Amman City Center', 'Petra Visitor Center', 'Wadi Rum Camp Area']),
  });

  await seedJordanTransferRouteLibrary(prisma, { dryRun: false, logger: log });

  const qaiaAmman = prisma.creates.find((entry) => entry.data.name === 'QAIA Airport -> Amman');
  const petraWadiRum = prisma.creates.find((entry) => entry.data.name === 'Petra -> Wadi Rum');

  assert.equal(qaiaAmman.data.fromPlaceId, 'queen-alia-international-airport');
  assert.equal(qaiaAmman.data.toPlaceId, 'amman-city-center');
  assert.equal(petraWadiRum.data.fromPlaceId, 'petra-visitor-center');
  assert.equal(petraWadiRum.data.toPlaceId, 'wadi-rum-camp-area');
});

test('Jordan transfer route seed updates existing routes idempotently by normalized key', async () => {
  const log = logger();
  const existing: JordanTransferRoute = {
    id: 'route-existing',
    normalizedKey: 'queen_alia_international_airport_amman_city_center',
    fromPlaceId: 'queen-alia-international-airport',
    toPlaceId: 'amman-city-center',
    name: 'Old name',
    routeType: 'TRANSFER_ROUTE',
    durationMinutes: 30,
    distanceKm: 20,
    notes: null,
    isActive: false,
  };
  const prisma = fakePrisma({
    places: places(['Queen Alia International Airport', 'Amman City Center']),
    existingRoutes: [existing],
  });

  const result = await seedJordanTransferRouteLibrary(prisma, { dryRun: false, logger: log });

  assert.equal(result.updated, 1);
  assert.equal(prisma.updates.length, 1);
  assert.equal(prisma.creates.some((entry) => entry.data.normalizedKey === existing.normalizedKey), false);
  assert.deepEqual(prisma.updates[0].where, { id: 'route-existing' });
  assert.equal(prisma.updates[0].data.name, 'QAIA Airport -> Amman');
  assert.equal(prisma.updates[0].data.durationMinutes, 45);
  assert.equal(prisma.updates[0].data.distanceKm, 35);
});

test('Jordan transfer route apply can be run twice safely', async () => {
  const log = logger();
  const prisma = fakePrisma({
    places: places(['Queen Alia International Airport', 'Amman City Center']),
  });

  const first = await seedJordanTransferRouteLibrary(prisma, { dryRun: false, logger: log });
  const createsAfterFirst = prisma.creates.length;
  const updatesAfterFirst = prisma.updates.length;
  const second = await seedJordanTransferRouteLibrary(prisma, { dryRun: false, logger: log });

  assert.equal(first.created, 2);
  assert.equal(createsAfterFirst, 2);
  assert.equal(updatesAfterFirst, 0);
  assert.equal(second.created, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.unchanged, 2);
  assert.equal(prisma.creates.length, createsAfterFirst);
  assert.equal(prisma.updates.length, updatesAfterFirst);
});

test('Jordan transfer route duplicate normalized key collision updates canonical active row without crashing', async () => {
  const log = logger();
  const normalizedKey = 'queen_alia_international_airport_amman_city_center';
  const prisma = fakePrisma({
    places: places(['Queen Alia International Airport', 'Amman City Center']),
    existingRoutes: [
      {
        id: 'route-archived',
        normalizedKey,
        fromPlaceId: 'legacy-from',
        toPlaceId: 'legacy-to',
        name: 'Archived duplicate',
        routeType: 'TRANSFER_ROUTE',
        durationMinutes: 30,
        distanceKm: 20,
        notes: null,
        isActive: false,
      },
      {
        id: 'route-active',
        normalizedKey,
        fromPlaceId: 'legacy-from',
        toPlaceId: 'legacy-to',
        name: 'Active duplicate',
        routeType: 'TRANSFER_ROUTE',
        durationMinutes: 30,
        distanceKm: 20,
        notes: null,
        isActive: true,
      },
    ],
  });

  const result = await seedJordanTransferRouteLibrary(prisma, { dryRun: false, logger: log });

  assert.equal(result.updated, 1);
  assert.equal(prisma.updates.length, 1);
  assert.deepEqual(prisma.updates[0].where, { id: 'route-active' });
  assert.equal(prisma.creates.some((entry) => entry.data.normalizedKey === normalizedKey), false);
  assert.equal(result.duplicateCollisions.length, 1);
  assert.match(result.duplicateCollisions[0], /JOR-TRF-QAIA-AMM/);
  assert.match(result.duplicateCollisions[0], new RegExp(normalizedKey));
  assert.ok(log.lines.some((line) => line.includes('Duplicate route normalizedKey collision:') && line.includes('JOR-TRF-QAIA-AMM')));
});

test('Jordan transfer route seed reports missing canonical places and skips dependent routes', async () => {
  const log = logger();
  const prisma = fakePrisma({
    places: places(['Amman City Center']),
  });

  const result = await seedJordanTransferRouteLibrary(prisma, { dryRun: false, logger: log });

  assert.ok(result.missingPlaces.includes('QAIA Airport'));
  assert.ok(result.planned.some((row) => row.code === 'JOR-TRF-QAIA-AMM' && row.action === 'SKIP_MISSING_PLACE'));
  assert.equal(prisma.creates.some((entry) => entry.data.name.includes('QAIA Airport')), false);
  assert.ok(log.lines.includes('Missing canonical places:'));
});
