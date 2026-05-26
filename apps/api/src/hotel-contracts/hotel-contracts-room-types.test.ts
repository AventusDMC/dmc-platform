import test from 'node:test';
import assert from 'node:assert/strict';

import { HotelContractsService } from './hotel-contracts.service';

// Room Types tab freeze fix — tests for the lightweight aggregation
// service.findRoomTypesSummary added to HotelContractsService. Goal: the
// endpoint must return per-room counts ONLY — never the full rate /
// supplement / cancellation rule blob that was freezing the admin UI.

function buildFakePrisma(opts: {
  contract?: any;
  roomCategories?: any[];
  rates?: any[];
  supplements?: any[];
}) {
  const rates = opts.rates || [];
  const supplements = opts.supplements || [];
  return {
    hotelContract: {
      findUnique: async ({ where }: any) => (where.id === opts.contract?.id ? opts.contract : null),
    },
    hotelRoomCategory: {
      findMany: async () => opts.roomCategories || [],
    },
    hotelRate: {
      groupBy: async ({ by, where }: any) => {
        const scoped = rates.filter((r) => r.contractId === where.contractId);
        const keyFn = (r: any) => by.map((field: string) => r[field]).join('::');
        const groups = new Map<string, any[]>();
        for (const r of scoped) {
          const key = keyFn(r);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(r);
        }
        const result: any[] = [];
        for (const [, members] of groups) {
          const first = members[0];
          const row: any = {};
          for (const field of by) row[field] = first[field];
          row._count = { _all: members.length };
          // Build min/max for cost when requested
          const costs = members.map((m) => m.cost).filter((c) => typeof c === 'number');
          row._min = costs.length ? { cost: Math.min(...costs) } : { cost: null };
          row._max = costs.length ? { cost: Math.max(...costs) } : { cost: null };
          result.push(row);
        }
        return result;
      },
      count: async ({ where }: any) => rates.filter((r) => r.contractId === where.contractId).length,
    },
    hotelContractSupplement: {
      groupBy: async ({ by, where }: any) => {
        const scoped = supplements.filter((s) => s.hotelContractId === where.hotelContractId);
        const groups = new Map<string, any[]>();
        for (const s of scoped) {
          const key = by.map((field: string) => s[field]).join('::');
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(s);
        }
        const result: any[] = [];
        for (const [, members] of groups) {
          const first = members[0];
          const row: any = {};
          for (const field of by) row[field] = first[field];
          row._count = { _all: members.length };
          result.push(row);
        }
        return result;
      },
    },
  };
}

const CONTRACT_ID = '11111111-1111-1111-1111-111111111111';
const HOTEL_ID = '22222222-2222-2222-2222-222222222222';

function buildContract() {
  return {
    id: CONTRACT_ID,
    hotelId: HOTEL_ID,
    validFrom: new Date('2026-01-01'),
    validTo: new Date('2026-12-31'),
    currency: 'USD',
    hotel: { id: HOTEL_ID, name: 'Test Hotel', city: 'Amman' },
  };
}

// ---------------------------------------------------------------------------
// findRoomTypesSummary — happy paths
// ---------------------------------------------------------------------------

test('findRoomTypesSummary: returns one entry per room category', async () => {
  const prisma = buildFakePrisma({
    contract: buildContract(),
    roomCategories: [
      { id: 'r1', name: 'Standard', code: 'STD', description: null, isActive: true },
      { id: 'r2', name: 'Deluxe', code: 'DLX', description: null, isActive: true },
    ],
    rates: [
      { contractId: CONTRACT_ID, roomCategoryId: 'r1', occupancyType: 'DBL', mealPlan: 'BB', seasonName: 'High', cost: 100 },
      { contractId: CONTRACT_ID, roomCategoryId: 'r2', occupancyType: 'DBL', mealPlan: 'HB', seasonName: 'High', cost: 200 },
    ],
  });
  const service = new HotelContractsService(prisma as any);
  const summary = await service.findRoomTypesSummary(CONTRACT_ID);
  assert.equal(summary.rooms.length, 2);
  assert.equal(summary.totalRates, 2);
});

test('findRoomTypesSummary: per-room rate count + min/max cost', async () => {
  const prisma = buildFakePrisma({
    contract: buildContract(),
    roomCategories: [{ id: 'r1', name: 'Standard', code: 'STD', description: null, isActive: true }],
    rates: [
      { contractId: CONTRACT_ID, roomCategoryId: 'r1', occupancyType: 'DBL', mealPlan: 'BB', seasonName: 'High', cost: 90 },
      { contractId: CONTRACT_ID, roomCategoryId: 'r1', occupancyType: 'DBL', mealPlan: 'BB', seasonName: 'Low', cost: 60 },
      { contractId: CONTRACT_ID, roomCategoryId: 'r1', occupancyType: 'TPL', mealPlan: 'HB', seasonName: 'High', cost: 150 },
    ],
  });
  const service = new HotelContractsService(prisma as any);
  const summary = await service.findRoomTypesSummary(CONTRACT_ID);
  assert.equal(summary.rooms[0].rateCount, 3);
  assert.equal(summary.rooms[0].minCost, 60);
  assert.equal(summary.rooms[0].maxCost, 150);
});

test('findRoomTypesSummary: aggregates occupancy + meal plan + season per room', async () => {
  const prisma = buildFakePrisma({
    contract: buildContract(),
    roomCategories: [{ id: 'r1', name: 'Standard', code: 'STD', description: null, isActive: true }],
    rates: [
      { contractId: CONTRACT_ID, roomCategoryId: 'r1', occupancyType: 'SGL', mealPlan: 'BB', seasonName: 'High', cost: 80 },
      { contractId: CONTRACT_ID, roomCategoryId: 'r1', occupancyType: 'DBL', mealPlan: 'BB', seasonName: 'High', cost: 100 },
      { contractId: CONTRACT_ID, roomCategoryId: 'r1', occupancyType: 'DBL', mealPlan: 'HB', seasonName: 'Low', cost: 70 },
    ],
  });
  const service = new HotelContractsService(prisma as any);
  const summary = await service.findRoomTypesSummary(CONTRACT_ID);
  const room = summary.rooms[0];
  assert.deepEqual(room.occupancyTypes.sort(), ['DBL', 'SGL']);
  assert.deepEqual(room.mealPlans.sort(), ['BB', 'HB']);
  assert.deepEqual(room.seasonNames.sort(), ['High', 'Low']);
});

test('findRoomTypesSummary: supplement count is scoped per room category', async () => {
  const prisma = buildFakePrisma({
    contract: buildContract(),
    roomCategories: [
      { id: 'r1', name: 'Standard', code: 'STD', description: null, isActive: true },
      { id: 'r2', name: 'Deluxe', code: 'DLX', description: null, isActive: true },
    ],
    rates: [],
    supplements: [
      { hotelContractId: CONTRACT_ID, roomCategoryId: 'r1' },
      { hotelContractId: CONTRACT_ID, roomCategoryId: 'r1' },
      { hotelContractId: CONTRACT_ID, roomCategoryId: 'r2' },
    ],
  });
  const service = new HotelContractsService(prisma as any);
  const summary = await service.findRoomTypesSummary(CONTRACT_ID);
  const r1 = summary.rooms.find((r) => r.id === 'r1')!;
  const r2 = summary.rooms.find((r) => r.id === 'r2')!;
  assert.equal(r1.supplementCount, 2);
  assert.equal(r2.supplementCount, 1);
});

test('findRoomTypesSummary: rooms with no rates report rateCount=0 + null min/max', async () => {
  const prisma = buildFakePrisma({
    contract: buildContract(),
    roomCategories: [{ id: 'r1', name: 'Suite', code: 'STE', description: null, isActive: true }],
    rates: [],
  });
  const service = new HotelContractsService(prisma as any);
  const summary = await service.findRoomTypesSummary(CONTRACT_ID);
  assert.equal(summary.rooms[0].rateCount, 0);
  assert.equal(summary.rooms[0].minCost, null);
  assert.equal(summary.rooms[0].maxCost, null);
});

// ---------------------------------------------------------------------------
// Defensive limits — never load full rate matrix
// ---------------------------------------------------------------------------

test('findRoomTypesSummary: payload bounded by room category count even with 1000+ rates', async () => {
  const manyRates = Array.from({ length: 2500 }, (_, i) => ({
    contractId: CONTRACT_ID,
    roomCategoryId: i % 3 === 0 ? 'r1' : i % 3 === 1 ? 'r2' : 'r3',
    occupancyType: ['SGL', 'DBL', 'TPL'][i % 3],
    mealPlan: ['BB', 'HB', 'FB'][i % 3],
    seasonName: `Season ${i % 4}`,
    cost: 50 + (i % 100),
  }));
  const prisma = buildFakePrisma({
    contract: buildContract(),
    roomCategories: [
      { id: 'r1', name: 'Standard', code: 'STD', description: null, isActive: true },
      { id: 'r2', name: 'Deluxe', code: 'DLX', description: null, isActive: true },
      { id: 'r3', name: 'Suite', code: 'STE', description: null, isActive: true },
    ],
    rates: manyRates,
  });
  const service = new HotelContractsService(prisma as any);
  const summary = await service.findRoomTypesSummary(CONTRACT_ID);
  // Exactly 3 room rows — NOT 2500 rate rows.
  assert.equal(summary.rooms.length, 3);
  assert.equal(summary.totalRates, 2500);
  // Per-room rate counts roll up correctly.
  const total = summary.rooms.reduce((sum, r) => sum + r.rateCount, 0);
  assert.equal(total, 2500);
});

test('findRoomTypesSummary: never returns individual rate / supplement / cancellation rule rows', async () => {
  const prisma = buildFakePrisma({
    contract: buildContract(),
    roomCategories: [{ id: 'r1', name: 'Standard', code: 'STD', description: null, isActive: true }],
    rates: [
      {
        id: 'rate-id-1',
        contractId: CONTRACT_ID,
        roomCategoryId: 'r1',
        occupancyType: 'DBL',
        mealPlan: 'BB',
        seasonName: 'High',
        cost: 100,
        // Fields the audit listed as "freezing" — must NOT appear in response.
        salesTaxPercent: 10,
        salesTaxIncluded: false,
        serviceChargePercent: 5,
        tourismFeeAmount: 2,
        tourismFeeCurrency: 'JOD',
      },
    ],
  });
  const service = new HotelContractsService(prisma as any);
  const summary = await service.findRoomTypesSummary(CONTRACT_ID);
  // Stringify the whole payload and assert the heavy field names are
  // not present — that proves we aren't accidentally leaking rate IDs,
  // tax profiles, cancellation rules, or imported PDF blob keys.
  const serialized = JSON.stringify(summary);
  assert.ok(!serialized.includes('rate-id-1'), 'should not include individual rate IDs');
  assert.ok(!serialized.includes('salesTaxPercent'), 'should not include tax fields');
  assert.ok(!serialized.includes('tourismFeeAmount'), 'should not include tourism fee fields');
  assert.ok(!serialized.includes('cancellationRule'), 'should not include cancellation rules');
});
