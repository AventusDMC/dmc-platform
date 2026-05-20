import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatSafeFitMigrationPreview, previewSafeFitAlmushtariPricingMigration } from './almushtari-fit-pricing-migration';

function createPrismaMock() {
  const writes: Array<{ model: string; action: string; args: unknown }> = [];
  return {
    writes,
    prisma: {
      supplier: {
        findFirst: async () => ({ id: 'supplier-almushtari', name: 'Almushtari Logistics Services' }),
      },
      vehicle: {
        findMany: async () => [
          { id: 'vehicle-sedan', name: 'Sedan 2', maxPax: 2 },
          { id: 'vehicle-mini-van', name: 'Mini Van 6', maxPax: 6 },
          { id: 'vehicle-van', name: 'Van 9', maxPax: 9 },
          { id: 'vehicle-coaster', name: 'Toyota Coaster / Mini Bus 17', maxPax: 17 },
        ],
      },
      transportServiceType: {
        findMany: async () => [
          { id: 'service-airport', name: 'Airport Transfer', code: 'AIRPORT_TRANSFER', classification: 'ROUTE_TRANSFER' },
          { id: 'service-point', name: 'Point-to-Point', code: 'POINT_TO_POINT', classification: 'ROUTE_TRANSFER' },
          { id: 'service-border', name: 'Border Transfer', code: 'BORDER_TRANSFER', classification: 'ROUTE_TRANSFER' },
          { id: 'service-full-day', name: 'Daily Full Day', code: 'DAILY_FULL_DAY', classification: 'DAILY_PACKAGE' },
        ],
      },
      route: {
        findMany: async () => [
          {
            id: 'route-qaia-amman',
            name: 'Queen Alia Airport -> Amman',
            normalizedKey: 'queen_alia_airport_amman',
            routeType: 'TRANSFER_ROUTE',
            fromPlaceId: 'place-qaia',
            toPlaceId: 'place-amman',
            fromPlace: { name: 'Queen Alia Airport' },
            toPlace: { name: 'Amman' },
          },
          {
            id: 'route-amman-petra',
            name: 'Amman -> Petra',
            normalizedKey: 'amman_petra',
            routeType: 'TRANSFER_ROUTE',
            fromPlaceId: 'place-amman',
            toPlaceId: 'place-petra',
            fromPlace: { name: 'Amman' },
            toPlace: { name: 'Petra' },
          },
          {
            id: 'route-amman-border',
            name: 'Amman -> King Hussein Bridge',
            normalizedKey: 'amman_king_hussein_bridge',
            routeType: 'TRANSFER_ROUTE',
            fromPlaceId: 'place-amman',
            toPlaceId: 'place-border',
            fromPlace: { name: 'Amman' },
            toPlace: { name: 'King Hussein Bridge' },
          },
        ],
      },
      vehicleRate: {
        findFirst: async () => null,
        create: async (args: unknown) => {
          writes.push({ model: 'vehicleRate', action: 'create', args });
          return { id: 'created-rate' };
        },
        update: async (args: unknown) => {
          writes.push({ model: 'vehicleRate', action: 'update', args });
          return { id: 'updated-rate' };
        },
      },
    },
  };
}

test('safe FIT pricing migration only makes Almushtari Sedan/Mini Van/Van transfer rows eligible', async () => {
  const { prisma, writes } = createPrismaMock();
  const rows = [
    {
      Supplier: 'Almushtari Logistics Services',
      Route: 'Queen Alia Airport -> Amman',
      Vehicle: 'Sedan 2',
      'Pricing Mode': 'Airport Transfer',
      Cost: '25',
      Currency: 'USD',
    },
    {
      Supplier: 'Almushtari Logistics Services',
      Route: 'Amman -> Petra',
      Vehicle: 'Mini Van 5',
      'Pricing Mode': 'Point-to-Point',
      Cost: '95',
      Currency: 'USD',
    },
    {
      Supplier: 'Almushtari Logistics Services',
      Route: 'Amman -> King Hussein Bridge',
      Vehicle: 'Van 9',
      'Pricing Mode': 'Border Transfer',
      Cost: '80',
      Currency: 'USD',
    },
    {
      Supplier: 'Other Transport Supplier',
      Route: 'Queen Alia Airport -> Amman',
      Vehicle: 'Sedan 2',
      'Pricing Mode': 'Airport Transfer',
      Cost: '1',
      Currency: 'USD',
    },
    {
      Supplier: 'Almushtari Logistics Services',
      Route: 'Amman -> Petra',
      Vehicle: 'Toyota Coaster / Mini Bus 17',
      'Pricing Mode': 'Point-to-Point',
      Cost: '150',
      Currency: 'USD',
    },
    {
      Supplier: 'Almushtari Logistics Services',
      Route: 'Petra -> Wadi Rum',
      Vehicle: 'Van 9',
      'Pricing Mode': 'Point-to-Point',
      Cost: '75',
      Currency: 'USD',
    },
    {
      Supplier: 'Almushtari Logistics Services',
      Route: 'Amman -> Petra',
      Vehicle: 'Sedan 2',
      'Pricing Mode': 'Daily Full Day',
      Cost: '200',
      Currency: 'USD',
    },
  ];

  const summary = await previewSafeFitAlmushtariPricingMigration(rows, prisma as any);

  assert.equal(summary.mode, 'dry-run');
  assert.equal(summary.eligibleRows, 3);
  assert.equal(summary.skippedNonAlmushtariRows, 1);
  assert.equal(summary.skippedBusCoachRows, 1);
  assert.deepEqual(summary.unmappedRouteNames, ['Petra -> Wadi Rum']);
  assert.equal(summary.previewRows.filter((row) => row.action === 'CREATE').length, 3);
  assert.equal(summary.previewRows[1].vehicle, 'Mini Van 6');
  assert.equal(writes.length, 0, 'dry-run preview must not write');
  assert.match(formatSafeFitMigrationPreview(summary), /Route \| Supplier \| Vehicle \| Pricing Mode \| Cost \| Currency \| Action \| Warning/);
});

test('safe FIT pricing migration only writes eligible rows when apply is explicit', async () => {
  const { prisma, writes } = createPrismaMock();
  const rows = [
    {
      Supplier: 'Almushtari Logistics Services',
      Route: 'Queen Alia Airport -> Amman',
      Vehicle: 'Sedan 2',
      'Pricing Mode': 'Airport Transfer',
      Cost: '25',
      Currency: 'USD',
    },
    {
      Supplier: 'Other Transport Supplier',
      Route: 'Queen Alia Airport -> Amman',
      Vehicle: 'Sedan 2',
      'Pricing Mode': 'Airport Transfer',
      Cost: '1',
      Currency: 'USD',
    },
    {
      Supplier: 'Almushtari Logistics Services',
      Route: 'Amman -> Petra',
      Vehicle: 'Large Coach 49',
      'Pricing Mode': 'Point-to-Point',
      Cost: '250',
      Currency: 'USD',
    },
  ];

  const summary = await previewSafeFitAlmushtariPricingMigration(rows, prisma as any, { apply: true });

  assert.equal(summary.mode, 'apply');
  assert.equal(summary.eligibleRows, 1);
  assert.equal(summary.createdRates, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].model, 'vehicleRate');
  assert.equal(writes[0].action, 'create');
});

test('safe FIT pricing migration reports duplicate and conflicting Almushtari transfer rows', async () => {
  const { prisma } = createPrismaMock();
  const rows = [
    {
      Supplier: 'Almushtari Logistics Services',
      Route: 'Queen Alia Airport -> Amman',
      Vehicle: 'Sedan 2',
      'Pricing Mode': 'Airport Transfer',
      Cost: '25',
      Currency: 'USD',
    },
    {
      Supplier: 'Almushtari Logistics Services',
      Route: 'Queen Alia Airport -> Amman',
      Vehicle: 'Sedan 2',
      'Pricing Mode': 'Airport Transfer',
      Cost: '30',
      Currency: 'USD',
    },
  ];

  const summary = await previewSafeFitAlmushtariPricingMigration(rows, prisma as any);

  assert.equal(summary.eligibleRows, 1);
  assert.equal(summary.duplicateConflictingRows.length, 1);
  assert.match(summary.duplicateConflictingRows[0], /Conflicting row/);
  assert.equal(summary.previewRows[1].action, 'SKIP');
});
