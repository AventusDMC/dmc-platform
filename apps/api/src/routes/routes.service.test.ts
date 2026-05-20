import test = require('node:test');
import assert = require('node:assert/strict');
import { RoutesService } from './routes.service';

test('route catalog lookups are not filtered by actor company for DMC multi-company quotes', async () => {
  let findManyArgs: any;
  let findUniqueArgs: any;
  const service = new RoutesService({
    route: {
      findMany: async (args: any) => {
        findManyArgs = args;
        return [
          {
            id: 'route-1',
            name: 'QAIA to Petra',
            normalizedKey: 'qaia_petra',
            fromPlaceId: 'place-qaia',
            toPlaceId: 'place-petra',
            routeType: 'TRANSFER_ROUTE',
            notes: null,
            isActive: true,
            fromPlace: { name: 'QAIA' },
            toPlace: { name: 'Petra' },
          },
        ];
      },
      findUnique: async (args: any) => {
        findUniqueArgs = args;
        return {
          id: 'route-1',
          name: 'QAIA to Petra',
          normalizedKey: 'qaia_petra',
          fromPlaceId: 'place-qaia',
          toPlaceId: 'place-petra',
          routeType: 'TRANSFER_ROUTE',
          notes: null,
          isActive: true,
          fromPlace: { name: 'QAIA' },
          toPlace: { name: 'Petra' },
          _count: { vehicleRates: 0 },
        };
      },
    },
  } as any);

  const routes = await service.findAll({ active: true, type: 'TRANSFER_ROUTE' });
  const route = await service.findOne('route-1');

  assert.equal(routes.length, 1);
  assert.equal(route.id, 'route-1');
  assert.equal(findManyArgs.where.companyId, undefined);
  assert.equal(findManyArgs.where.clientCompanyId, undefined);
  assert.deepEqual(findUniqueArgs.where, { id: 'route-1' });
});

test('route catalog supports searchable larger route selector batches', async () => {
  let findManyArgs: any;
  const service = new RoutesService({
    route: {
      findMany: async (args: any) => {
        findManyArgs = args;
        return [];
      },
    },
  } as any);

  await service.findAll({ search: 'Amman', limit: 200 });

  assert.equal(findManyArgs.take, 200);
  assert.ok(findManyArgs.where.OR.some((entry: any) => entry.fromPlace?.is?.city?.contains === 'Amman'));
  assert.ok(findManyArgs.where.OR.some((entry: any) => entry.toPlace?.is?.city?.contains === 'Amman'));
});

test('route catalog normalizes legacy transfer labels to TRANSFER_ROUTE on write', async () => {
  let createdData: any;
  const service = new RoutesService({
    place: {
      findUnique: async ({ where }: any) => ({ id: where.id, name: where.id === 'place-qaia' ? 'QAIA' : 'Petra' }),
    },
    route: {
      findUnique: async () => null,
      create: async (args: any) => {
        createdData = args.data;
        return { id: 'route-1', ...args.data };
      },
    },
  } as any);

  await service.create({
    fromPlaceId: 'place-qaia',
    toPlaceId: 'place-petra',
    routeType: 'private-transfer',
  });

  assert.equal(createdData.routeType, 'TRANSFER_ROUTE');
});

test('route catalog creates active point-to-point transfers from canonical selector place ids', async () => {
  let createdData: any;
  let existingLookupKey: string | undefined;
  const places: Record<string, { id: string; name: string }> = {
    'place-amman': { id: 'place-amman', name: 'Amman' },
    'place-petra': { id: 'place-petra', name: 'Petra' },
  };
  const service = new RoutesService({
    place: {
      findUnique: async ({ where }: any) => places[where.id] || null,
    },
    route: {
      findUnique: async ({ where }: any) => {
        existingLookupKey = where.normalizedKey;
        return null;
      },
      create: async (args: any) => {
        createdData = args.data;
        return { id: 'route-amman-petra', ...args.data };
      },
    },
  } as any);

  const created = await service.create({
    fromPlaceId: 'place-amman',
    toPlaceId: 'place-petra',
    routeType: 'TRANSFER_ROUTE',
    isActive: true,
  });

  assert.equal(created.id, 'route-amman-petra');
  assert.equal(createdData.fromPlaceId, 'place-amman');
  assert.equal(createdData.toPlaceId, 'place-petra');
  assert.equal(createdData.name, 'Amman → Petra');
  assert.equal(createdData.routeType, 'TRANSFER_ROUTE');
  assert.equal(createdData.isActive, true);
  assert.equal(existingLookupKey, createdData.normalizedKey);
});

test('route catalog rejects excursion as a transport route type', async () => {
  const service = new RoutesService({
    place: {
      findUnique: async ({ where }: any) => ({ id: where.id, name: where.id === 'place-amman' ? 'Amman' : 'Petra' }),
    },
  } as any);

  await assert.rejects(
    () =>
      service.create({
        fromPlaceId: 'place-amman',
        toPlaceId: 'place-petra',
        routeType: 'Excursion',
      }),
    /Excursions must be created as Excursion Templates/,
  );
});

test('route catalog returns derived operational review flags without deleting legacy rows', async () => {
  const service = new RoutesService({
    route: {
      findMany: async () => [
        {
          id: 'route-legacy',
          name: 'Petra full day sightseeing',
          fromPlaceId: 'place-amman',
          toPlaceId: 'place-petra',
          routeType: 'Excursion',
          notes: 'Guide recommended',
          durationMinutes: 600,
          distanceKm: 240,
          isActive: true,
          fromPlace: { name: 'Amman', city: 'Amman' },
          toPlace: { name: 'Petra', city: 'Petra' },
        },
      ],
    },
  } as any);

  const routes = (await service.findAll({ type: 'debug' })) as any[];

  assert.equal(routes[0].canonicalRouteType, null);
  assert.equal(routes[0].routeOperations.taxonomyReview, 'REVIEW_ROUTE_TAXONOMY');
  assert.equal(routes[0].routeOperations.longDistance, true);
  assert.equal(routes[0].routeOperations.guideRecommended, true);
});

test('transfer route selectors default to canonical routes and preserve legacy rows when requested', async () => {
  const service = new RoutesService({
    route: {
      findMany: async () => [
        {
          id: 'route-canonical',
          name: 'Amman -> Petra',
          normalizedKey: 'amman_petra',
          fromPlaceId: 'place-amman',
          toPlaceId: 'place-petra',
          routeType: 'TRANSFER_ROUTE',
          notes: 'Jordan operational transfer route library. Route code: JOR-TRF-AMM-PET.',
          durationMinutes: 210,
          distanceKm: 235,
          isActive: true,
          fromPlace: { name: 'Amman', city: 'Amman' },
          toPlace: { name: 'Petra', city: 'Petra' },
        },
        {
          id: 'route-legacy',
          name: 'Imported Petra transfer',
          normalizedKey: null,
          fromPlaceId: 'place-amman-legacy',
          toPlaceId: 'place-petra-legacy',
          routeType: 'TRANSFER_ROUTE',
          notes: 'Imported historical route',
          durationMinutes: 210,
          distanceKm: 235,
          isActive: true,
          fromPlace: { name: 'Amman old', city: 'Amman' },
          toPlace: { name: 'Petra old', city: 'Petra' },
        },
      ],
    },
  } as any);

  const defaultRoutes = (await service.findAll({ type: 'TRANSFER_ROUTE' })) as any[];
  const legacyRoutes = (await service.findAll({ type: 'TRANSFER_ROUTE', includeLegacy: true })) as any[];

  assert.deepEqual(defaultRoutes.map((route) => route.id), ['route-canonical']);
  assert.deepEqual(legacyRoutes.map((route) => route.id), ['route-canonical', 'route-legacy']);
  assert.equal(legacyRoutes[0].isCanonicalTransferRoute, true);
  assert.equal(legacyRoutes[0].canonicalRouteCode, 'JOR-TRF-AMM-PET');
  assert.equal(legacyRoutes[0].selectorLabel, 'JOR-TRF-AMM-PET · Amman ↔ Petra');
  assert.equal(legacyRoutes[1].isCanonicalTransferRoute, false);
});
