import test = require('node:test');
import assert = require('node:assert/strict');
import { seedJordanCanonicalTransferPlaces, type PlaceRow } from './jordan-canonical-places';

function logger() {
  const lines: string[] = [];
  return {
    lines,
    log: (line: string) => lines.push(line),
    warn: (line: string) => lines.push(line),
    error: (line: string) => lines.push(line),
  };
}

function fakePrisma(options: { places?: PlaceRow[] } = {}) {
  const cities: any[] = [];
  const placeTypes: any[] = [];
  const places: any[] = [...(options.places || [])];
  const calls = {
    cityCreates: [] as any[],
    cityUpdates: [] as any[],
    placeTypeCreates: [] as any[],
    placeTypeUpdates: [] as any[],
    placeCreates: [] as any[],
    placeUpdates: [] as any[],
  };

  return {
    calls,
    city: {
      findMany: async () => cities,
      create: async (args: any) => {
        calls.cityCreates.push(args);
        const row = { id: `city-${calls.cityCreates.length}`, ...args.data };
        cities.push(row);
        return row;
      },
      update: async (args: any) => {
        calls.cityUpdates.push(args);
        return { id: args.where.id, ...args.data };
      },
    },
    placeType: {
      findMany: async () => placeTypes,
      create: async (args: any) => {
        calls.placeTypeCreates.push(args);
        const row = { id: `place-type-${calls.placeTypeCreates.length}`, ...args.data };
        placeTypes.push(row);
        return row;
      },
      update: async (args: any) => {
        calls.placeTypeUpdates.push(args);
        return { id: args.where.id, ...args.data };
      },
    },
    place: {
      findMany: async () => places,
      create: async (args: any) => {
        calls.placeCreates.push(args);
        const row = { id: `place-${calls.placeCreates.length}`, ...args.data };
        places.push(row);
        return row;
      },
      update: async (args: any) => {
        calls.placeUpdates.push(args);
        return { id: args.where.id, ...args.data };
      },
    },
  };
}

test('Jordan canonical places seed defaults to dry-run and prints clean place plan', async () => {
  const log = logger();
  const prisma = fakePrisma();

  const result = await seedJordanCanonicalTransferPlaces(prisma, { logger: log });

  assert.equal(result.dryRun, true);
  assert.equal(result.created, 8);
  assert.equal(prisma.calls.placeCreates.length, 0);
  assert.equal(prisma.calls.cityCreates.length, 0);
  assert.equal(log.lines[0], 'Place | Type | City | Aliases | Action');
  assert.ok(log.lines.some((line) => line.includes('Bethany | Religious Site | Bethany | Bethany Beyond the Jordan, Al-Maghtas | CREATE')));
});

test('Jordan canonical places seed creates only geographic tourism place rows', async () => {
  const log = logger();
  const prisma = fakePrisma();

  await seedJordanCanonicalTransferPlaces(prisma, { dryRun: false, logger: log });

  const createdNames = prisma.calls.placeCreates.map((call) => call.data.name);
  assert.deepEqual(createdNames.sort(), ['Ajloun', 'Bethany', 'Dana', 'Kerak', 'Mukawir', 'Pella', 'Shobak', 'Umm Qais'].sort());
  assert.ok(prisma.calls.placeCreates.every((call) => call.data.country === 'Jordan'));
  assert.ok(prisma.calls.placeCreates.every((call) => call.data.isActive === true));
  assert.equal(createdNames.some((name) => /service|package|tour|quote/i.test(name)), false);
});

test('Jordan canonical places seed canonicalizes useful aliases instead of creating alias rows', async () => {
  const log = logger();
  const prisma = fakePrisma({
    places: [
      { id: 'bethany-alias', name: 'Bethany Beyond the Jordan', type: 'Religious Site', city: 'Bethany', country: 'Jordan', isActive: true },
      { id: 'umm-qays-alias', name: 'Umm Qays', type: 'Archaeological Site', city: 'Umm Qais', country: 'Jordan', isActive: true },
      { id: 'karak-alias', name: 'Karak', type: 'Archaeological Site', city: 'Kerak', country: 'Jordan', isActive: true },
      { id: 'shoubak-alias', name: 'Shoubak', type: 'Archaeological Site', city: 'Shobak', country: 'Jordan', isActive: true },
    ],
  });

  await seedJordanCanonicalTransferPlaces(prisma, { dryRun: false, logger: log });

  const updatesById = new Map(prisma.calls.placeUpdates.map((call) => [call.where.id, call.data.name]));
  assert.equal(updatesById.get('bethany-alias'), 'Bethany');
  assert.equal(updatesById.get('umm-qays-alias'), 'Umm Qais');
  assert.equal(updatesById.get('karak-alias'), 'Kerak');
  assert.equal(updatesById.get('shoubak-alias'), 'Shobak');
  assert.equal(prisma.calls.placeCreates.some((call) => ['Bethany', 'Umm Qais', 'Kerak', 'Shobak'].includes(call.data.name)), false);
});

