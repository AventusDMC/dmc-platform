import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { VehicleRatesService } from './vehicle-rates.service';

function readRows(buffer: Buffer, sheetName: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
}

test('transfer tariff matrix exports one row per route supplier with canonical fleet price columns', async () => {
  const suppliers = [
    { id: 'supplier-a', name: 'Supplier A', type: 'transport' },
    { id: 'supplier-b', name: 'Supplier B', type: 'transport' },
  ];
  const prisma = {
    route: {
      findMany: async () => [
        {
          id: 'route-qaia-petra',
          normalizedKey: 'queen alia airport|petra',
          name: 'Queen Alia Airport -> Petra',
          distanceKm: 230,
          durationMinutes: 180,
          notes: null,
          fromPlace: { name: 'Queen Alia Airport' },
          toPlace: { name: 'Petra' },
        },
      ],
    },
    supplier: {
      findMany: async () => suppliers,
    },
    vehicleRate: {
      findMany: async () => [
        {
          id: 'rate-supplier-a-sedan',
          routeId: 'route-qaia-petra',
          supplierId: 'supplier-a',
          routeName: 'Queen Alia Airport -> Petra',
          price: 95,
          currency: 'USD',
          notes: 'small vehicles only',
          validFrom: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-02'),
          createdAt: new Date('2026-01-01'),
          supplier: suppliers[0],
          vehicle: { name: 'Sedan 2', maxPax: 2 },
          serviceType: { name: 'Airport Transfer', code: 'AIRPORT_TRANSFER', classification: 'ROUTE_TRANSFER' },
          route: { id: 'route-qaia-petra', name: 'Queen Alia Airport -> Petra' },
        },
        {
          id: 'rate-supplier-b-coach',
          routeId: 'route-qaia-petra',
          supplierId: 'supplier-b',
          routeName: 'Queen Alia Airport -> Petra',
          price: 420,
          currency: 'USD',
          notes: 'buses only',
          validFrom: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-02'),
          createdAt: new Date('2026-01-01'),
          supplier: suppliers[1],
          vehicle: { name: 'Large Coach 49', maxPax: 49 },
          serviceType: { name: 'Airport Transfer', code: 'AIRPORT_TRANSFER', classification: 'ROUTE_TRANSFER' },
          route: { id: 'route-qaia-petra', name: 'Queen Alia Airport -> Petra' },
        },
        {
          id: 'rate-legacy-vehicle',
          routeId: 'route-qaia-petra',
          supplierId: 'supplier-a',
          routeName: 'Queen Alia Airport -> Petra',
          price: 999,
          currency: 'USD',
          notes: 'legacy vehicle should not export',
          validFrom: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-02'),
          createdAt: new Date('2026-01-01'),
          supplier: suppliers[0],
          vehicle: { name: 'Supplier Custom Bus', maxPax: 49 },
          serviceType: { name: 'Airport Transfer', code: 'AIRPORT_TRANSFER', classification: 'ROUTE_TRANSFER' },
          route: { id: 'route-qaia-petra', name: 'Queen Alia Airport -> Petra' },
        },
      ],
    },
  };
  const service = new VehicleRatesService(prisma as any);
  const exported = await service.exportTransferRouteTariffMatrix();
  const rows = readRows(exported.buffer, 'Transfer Tariffs');

  assert.equal(exported.fileName, 'transfer-route-tariff-matrix.xlsx');
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.Supplier),
    ['Supplier A', 'Supplier B'],
  );
  assert.equal(rows[0]['Sedan 2'], 95);
  assert.equal(rows[0]['Large Coach 49'], '');
  assert.equal(rows[1]['Sedan 2'], '');
  assert.equal(rows[1]['Large Coach 49'], 420);
  assert.equal(rows[0]['Route Code'], 'TRF-QUEENALIAAIR');
  assert.equal(rows[0]['Pricing Mode'], 'Airport Transfer');
  assert.equal(rows[0]['Notes'], 'small vehicles only');
  assert.equal(rows[1]['Notes'], 'buses only');
});

test('touring tariff matrix exports route supplier rows with blank missing vehicle prices', async () => {
  const suppliers = [
    { id: 'supplier-a', name: 'Supplier A', type: 'transport' },
    { id: 'supplier-b', name: 'Supplier B', type: 'transport' },
  ];
  const prisma = {
    touringRoute: {
      findMany: async () => [
        {
          id: 'touring-route-jordan',
          code: 'JOR-TR-001',
          name: 'Classic Jordan',
          durationDays: 3,
          overnightRisk: true,
          includedKm: 480,
          estimatedDistanceKm: 500,
          includedHours: 18,
          estimatedDriveHours: 20,
          stops: [
            { city: 'Amman', location: null, order: 1 },
            { city: 'Petra', location: 'Petra Visitor Center', order: 2 },
          ],
        },
      ],
    },
    supplier: {
      findMany: async () => suppliers,
    },
    touringRoutePricing: {
      findMany: async () => [
        {
          id: 'pricing-supplier-a-van',
          touringRouteId: 'touring-route-jordan',
          supplierId: 'supplier-a',
          baseCost: 610,
          currency: 'JOD',
          notes: 'small group',
          validFrom: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-02'),
          createdAt: new Date('2026-01-01'),
          supplier: suppliers[0],
          vehicle: { name: 'Van 9', maxPax: 9 },
          touringRoute: { id: 'touring-route-jordan', code: 'JOR-TR-001', name: 'Classic Jordan' },
        },
        {
          id: 'pricing-supplier-b-bus',
          touringRouteId: 'touring-route-jordan',
          supplierId: 'supplier-b',
          baseCost: 1200,
          currency: 'JOD',
          notes: 'coach',
          validFrom: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-02'),
          createdAt: new Date('2026-01-01'),
          supplier: suppliers[1],
          vehicle: { name: 'Medium Bus 30', maxPax: 30 },
          touringRoute: { id: 'touring-route-jordan', code: 'JOR-TR-001', name: 'Classic Jordan' },
        },
      ],
    },
  };
  const service = new VehicleRatesService(prisma as any);
  const exported = await service.exportTouringRouteTariffMatrix();
  const rows = readRows(exported.buffer, 'Touring Tariffs');

  assert.equal(exported.fileName, 'touring-route-tariff-matrix.xlsx');
  assert.equal(rows.length, 2);
  assert.equal(rows[0]['Touring Route Code'], 'JOR-TR-001');
  assert.equal(rows[0].Stops, 'Amman > Petra Visitor Center');
  assert.equal(rows[0].Overnight, 'Yes');
  assert.equal(rows[0]['Van 9'], 610);
  assert.equal(rows[0]['Medium Bus 30'], '');
  assert.equal(rows[1]['Van 9'], '');
  assert.equal(rows[1]['Medium Bus 30'], 1200);
});
