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
            fromPlaceId: 'place-qaia',
            toPlaceId: 'place-petra',
            routeType: 'transfer',
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
          fromPlaceId: 'place-qaia',
          toPlaceId: 'place-petra',
          routeType: 'transfer',
          notes: null,
          isActive: true,
          fromPlace: { name: 'QAIA' },
          toPlace: { name: 'Petra' },
          _count: { vehicleRates: 0 },
        };
      },
    },
  } as any);

  const routes = await service.findAll({ active: true, type: 'transfer' });
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
