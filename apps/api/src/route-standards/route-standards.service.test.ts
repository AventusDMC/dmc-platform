import test from 'node:test';
import assert from 'node:assert/strict';

import { RouteStandardsService, computeRouteTimingConfidence } from './route-standards.service';

function buildFakePrisma(initial: Array<any> = []) {
  const store = [...initial];
  return {
    routeStandard: {
      findMany: async () => [...store],
      findUnique: async ({ where }: any) => store.find((r) => (where.id ? r.id === where.id : r.routeCode === where.routeCode)) || null,
      create: async ({ data }: any) => {
        if (store.some((r) => r.routeCode === data.routeCode)) {
          const err: any = new Error('Unique constraint failed');
          err.code = 'P2002';
          throw err;
        }
        const created = { id: `id-${store.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        store.push(created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const idx = store.findIndex((r) => r.id === where.id);
        if (idx < 0) throw new Error('not found');
        if (data.routeCode && store.some((r, i) => i !== idx && r.routeCode === data.routeCode)) {
          const err: any = new Error('Unique constraint failed');
          err.code = 'P2002';
          throw err;
        }
        store[idx] = { ...store[idx], ...data, updatedAt: new Date() };
        return store[idx];
      },
      delete: async ({ where }: any) => {
        const idx = store.findIndex((r) => r.id === where.id);
        if (idx < 0) throw new Error('not found');
        return store.splice(idx, 1)[0];
      },
    },
  };
}

test('route standards service: create normalizes routeCode and stores all fields', async () => {
  const prisma = buildFakePrisma();
  const service = new RouteStandardsService(prisma as any);
  const created = await service.create({
    routeCode: 'amm pet',
    routeName: 'Amman to Petra',
    fromCity: 'Amman',
    toCity: 'Petra',
    standardDistanceKm: 235,
    standardDurationHours: 3.5,
    operationalBufferMinutes: 30,
    longDistanceFlag: false,
    overnightRisk: false,
    notes: 'Standard transfer',
  });
  assert.equal(created.routeCode, 'AMM_PET');
  assert.equal(created.fromCity, 'Amman');
  assert.equal(created.standardDistanceKm, 235);
  assert.equal(created.standardDurationHours, 3.5);
  assert.equal(created.operationalBufferMinutes, 30);
  assert.equal(created.longDistanceFlag, false);
});

test('route standards service: rejects empty routeCode and routeName', async () => {
  const service = new RouteStandardsService(buildFakePrisma() as any);
  await assert.rejects(() => service.create({ routeCode: '', routeName: 'x' }), /routeCode is required/);
  await assert.rejects(() => service.create({ routeCode: 'X', routeName: '' }), /routeName is required/);
});

test('route standards service: surface duplicate routeCode as BadRequest', async () => {
  const service = new RouteStandardsService(buildFakePrisma() as any);
  await service.create({ routeCode: 'AMM_PET', routeName: 'Amman to Petra' });
  await assert.rejects(
    () => service.create({ routeCode: 'AMM_PET', routeName: 'Duplicate attempt' }),
    /already in use/,
  );
});

test('route standards service: update applies partial changes', async () => {
  const service = new RouteStandardsService(buildFakePrisma() as any);
  const created = await service.create({ routeCode: 'AMM_PET', routeName: 'Amman to Petra', standardDurationHours: 3 });
  const updated = await service.update(created.id, { standardDurationHours: 4, notes: 'Updated' });
  assert.equal(updated.standardDurationHours, 4);
  assert.equal(updated.notes, 'Updated');
  assert.equal(updated.routeName, 'Amman to Petra'); // unchanged
});

test('route standards service: bulkUpsert creates new + updates existing', async () => {
  const service = new RouteStandardsService(buildFakePrisma() as any);
  await service.create({ routeCode: 'AMM_PET', routeName: 'Amman to Petra', standardDurationHours: 3 });
  const result = await service.bulkUpsert([
    { routeCode: 'AMM_PET', routeName: 'Amman to Petra', standardDurationHours: 3.5 }, // existing -> update
    { routeCode: 'PET_WR', routeName: 'Petra to Wadi Rum', standardDurationHours: 2 }, // new -> create
  ]);
  assert.equal(result.created, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.total, 2);
});

test('route standards service: bulkUpsert rejects duplicate codes within upload', async () => {
  const service = new RouteStandardsService(buildFakePrisma() as any);
  await assert.rejects(
    () =>
      service.bulkUpsert([
        { routeCode: 'AMM_PET', routeName: 'First' },
        { routeCode: 'AMM_PET', routeName: 'Duplicate in same upload' },
      ]),
    /Duplicate route codes/,
  );
});

test('route standards service: bootstrapFromExistingRoutes creates missing standards from both catalogs', async () => {
  const prismaStore: any[] = [];
  const fakePrisma = {
    routeStandard: {
      findMany: async (args: any) => {
        if (args?.select?.routeCode === true) {
          return prismaStore.map((r) => ({ routeCode: r.routeCode }));
        }
        return prismaStore;
      },
      findUnique: async ({ where }: any) => prismaStore.find((r) => r.routeCode === where.routeCode) || null,
      create: async ({ data }: any) => {
        if (prismaStore.some((r) => r.routeCode === data.routeCode)) {
          const err: any = new Error('Unique constraint failed');
          err.code = 'P2002';
          throw err;
        }
        const row = { id: `id-${prismaStore.length + 1}`, ...data };
        prismaStore.push(row);
        return row;
      },
    },
    touringRoute: {
      findMany: async () => [
        // Will create
        {
          code: 'AMM_PET',
          name: 'Amman to Petra',
          startCity: 'Amman',
          estimatedDistanceKm: 235,
          estimatedDriveHours: 3.5,
          longDistance: false,
          mountainRoad: false,
          overnightRisk: false,
        },
        // Should be skipped — already exists
        {
          code: 'PET_WR',
          name: 'Petra to Wadi Rum',
          startCity: 'Petra',
          estimatedDistanceKm: 110,
          estimatedDriveHours: 1.5,
        },
        // Missing data — created with warning
        {
          code: 'WR_AQ',
          name: 'Wadi Rum to Aqaba',
          startCity: 'Wadi Rum',
          estimatedDistanceKm: null,
          estimatedDriveHours: null,
        },
        // No code — skipped
        {
          code: null,
          name: 'Orphan touring route',
          startCity: 'Amman',
        },
      ],
    },
    route: {
      findMany: async () => [
        // Transfer route — will create
        {
          name: 'King Hussein Airport to Aqaba',
          normalizedKey: 'aqj_aqaba',
          distanceKm: 12,
          durationMinutes: 20,
          isActive: true,
          fromPlace: { name: 'King Hussein International Airport', city: 'Aqaba' },
          toPlace: { name: 'Aqaba City Center', city: 'Aqaba' },
        },
      ],
    },
  };
  // Seed an existing PET_WR standard so it gets skipped
  prismaStore.push({ id: 'existing-1', routeCode: 'PET_WR' });

  const service = new RouteStandardsService(fakePrisma as any);
  const result = await service.bootstrapFromExistingRoutes();

  assert.equal(result.touringRoutesScanned, 4);
  assert.equal(result.transferRoutesScanned, 1);
  assert.equal(result.createdFromTouring, 2); // AMM_PET + WR_AQ
  assert.equal(result.createdFromTransfer, 1); // AQJ_AQABA
  assert.equal(result.createdTotal, 3);
  assert.equal(result.skippedExistingByCode, 1); // PET_WR
  assert.equal(result.skippedWithoutCode, 1); // touring route with no code

  // WR_AQ should be flagged with missing data
  assert.equal(result.missingDataWarnings.length, 1);
  assert.equal(result.missingDataWarnings[0].routeCode, 'WR_AQ');
  assert.ok(result.missingDataWarnings[0].missing.includes('distance'));
  assert.ok(result.missingDataWarnings[0].missing.includes('duration'));

  // Created rows should be tagged AUTO_BOOTSTRAP
  const ammPet = prismaStore.find((r) => r.routeCode === 'AMM_PET');
  assert.equal(ammPet?.source, 'AUTO_BOOTSTRAP');
  const aqjAqaba = prismaStore.find((r) => r.routeCode === 'AQJ_AQABA');
  assert.equal(aqjAqaba?.source, 'AUTO_BOOTSTRAP');
  // Transfer-route airport detection: AQJ matches the airport heuristic
  assert.equal(aqjAqaba?.airportRouteFlag, true);
});

test('route standards service: bootstrap never overwrites operator-curated standards', async () => {
  // Existing standard with operator-curated buffer + notes
  const prismaStore: any[] = [
    {
      id: 'existing-1',
      routeCode: 'AMM_PET',
      operationalBufferMinutes: 45,
      notes: 'Operator-curated: construction zone 60-80km',
      source: 'MANUAL',
    },
  ];
  const fakePrisma = {
    routeStandard: {
      findMany: async (args: any) => (args?.select?.routeCode ? prismaStore.map((r) => ({ routeCode: r.routeCode })) : prismaStore),
      create: async () => {
        throw new Error('Should not have been called — standard exists');
      },
    },
    touringRoute: {
      findMany: async () => [{ code: 'AMM_PET', name: 'Amman to Petra', startCity: 'Amman' }],
    },
    route: { findMany: async () => [] },
  };
  const service = new RouteStandardsService(fakePrisma as any);
  const result = await service.bootstrapFromExistingRoutes();
  assert.equal(result.createdTotal, 0);
  assert.equal(result.skippedExistingByCode, 1);
  // Existing row untouched
  assert.equal(prismaStore[0].operationalBufferMinutes, 45);
  assert.equal(prismaStore[0].notes, 'Operator-curated: construction zone 60-80km');
});

test('computeRouteTimingConfidence: priority order border > mountain > long > airport > normal', () => {
  assert.equal(computeRouteTimingConfidence({ borderCrossingFlag: true, mountainRoadFlag: true }), 'Border Delay Risk');
  assert.equal(computeRouteTimingConfidence({ mountainRoadFlag: true, longDistanceFlag: true }), 'Mountain Road Delay Risk');
  assert.equal(computeRouteTimingConfidence({ longDistanceFlag: true }), 'Long Distance Drive');
  assert.equal(computeRouteTimingConfidence({ standardDurationHours: 6 }), 'Long Distance Drive');
  assert.equal(computeRouteTimingConfidence({ airportRouteFlag: true }), 'Heavy Traffic Risk');
  assert.equal(computeRouteTimingConfidence({}), 'Normal Traffic');
});
