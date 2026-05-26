import test from 'node:test';
import assert from 'node:assert/strict';

import { HotelsService } from './hotels.service';

// Hotel Master Room Categories freeze fix — service-level tests for
// the lightweight summary endpoint. The whole point of the fix is to
// avoid the heavy findAll() path that triggers per-hotel supplier
// resolution. These tests lock in that contract.

function buildFakePrisma(opts: {
  categories?: any[];
  rateGroups?: any[];
  contracts?: any[];
  category?: any;
} = {}) {
  // Track every model.method call so we can assert which DB paths the
  // summary endpoint touches. This is how we prove the heavy supplier
  // resolver never runs.
  const calls: Array<{ model: string; method: string; args: any }> = [];
  return {
    __calls: calls,
    hotel: {
      findMany: async (args: any) => {
        calls.push({ model: 'hotel', method: 'findMany', args });
        return [];
      },
    },
    hotelRoomCategory: {
      findMany: async (args: any) => {
        calls.push({ model: 'hotelRoomCategory', method: 'findMany', args });
        const rows = opts.categories || [];
        if (args?.where?.hotelId) {
          return rows.filter((row: any) => row.hotelId === args.where.hotelId);
        }
        return rows;
      },
      findUnique: async (args: any) => {
        calls.push({ model: 'hotelRoomCategory', method: 'findUnique', args });
        return opts.category || null;
      },
    },
    hotelRate: {
      groupBy: async (args: any) => {
        calls.push({ model: 'hotelRate', method: 'groupBy', args });
        return opts.rateGroups || [];
      },
    },
    hotelContract: {
      findMany: async (args: any) => {
        calls.push({ model: 'hotelContract', method: 'findMany', args });
        return opts.contracts || [];
      },
    },
    supplier: {
      // If the new summary path ever falls back to supplier resolution,
      // these test cases will catch the regression — supplier model
      // calls fail loud.
      findUnique: async () => {
        throw new Error('Supplier lookup must NEVER fire from the room-categories summary path.');
      },
    },
  };
}

// ---------------------------------------------------------------------------
// findRoomCategoriesSummary — happy path
// ---------------------------------------------------------------------------

test('findRoomCategoriesSummary: returns one entry per category with hotel name + counts', async () => {
  const prisma = buildFakePrisma({
    categories: [
      {
        id: 'cat-1',
        hotelId: 'h-1',
        name: 'Standard',
        code: 'STD',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        hotel: { id: 'h-1', name: 'Hilton Amman', city: 'Amman', cityRecord: null, _count: { contracts: 2 } },
        _count: { hotelRates: 12, quoteItems: 3 },
      },
      {
        id: 'cat-2',
        hotelId: 'h-2',
        name: 'Deluxe',
        code: 'DLX',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        hotel: { id: 'h-2', name: 'Movenpick Petra', city: 'Petra', cityRecord: null, _count: { contracts: 1 } },
        _count: { hotelRates: 6, quoteItems: 0 },
      },
    ],
  });
  const service = new HotelsService(prisma as any);
  const summary = await service.findRoomCategoriesSummary();
  assert.equal(summary.length, 2);
  assert.equal(summary[0].name, 'Standard');
  assert.equal(summary[0].hotelName, 'Hilton Amman');
  assert.equal(summary[0].linkedRateCount, 12);
  assert.equal(summary[0].linkedQuoteItemCount, 3);
  assert.equal(summary[0].hotelContractCount, 2);
});

test('findRoomCategoriesSummary: filters by hotelId when provided', async () => {
  const prisma = buildFakePrisma({
    categories: [
      {
        id: 'cat-1',
        hotelId: 'h-1',
        name: 'Standard',
        code: 'STD',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        hotel: { id: 'h-1', name: 'Hilton', city: 'Amman', cityRecord: null, _count: { contracts: 0 } },
        _count: { hotelRates: 0, quoteItems: 0 },
      },
      {
        id: 'cat-2',
        hotelId: 'h-2',
        name: 'Deluxe',
        code: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        hotel: { id: 'h-2', name: 'Movenpick', city: 'Petra', cityRecord: null, _count: { contracts: 0 } },
        _count: { hotelRates: 0, quoteItems: 0 },
      },
    ],
  });
  const service = new HotelsService(prisma as any);
  const summary = await service.findRoomCategoriesSummary({ hotelId: 'h-2' });
  assert.equal(summary.length, 1);
  assert.equal(summary[0].id, 'cat-2');
});

test('findRoomCategoriesSummary: prefers cityRecord.name over hotel.city when both exist', async () => {
  const prisma = buildFakePrisma({
    categories: [
      {
        id: 'cat-1',
        hotelId: 'h-1',
        name: 'Standard',
        code: 'STD',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        hotel: {
          id: 'h-1',
          name: 'Hilton',
          city: 'amman',
          cityRecord: { name: 'Amman' },
          _count: { contracts: 0 },
        },
        _count: { hotelRates: 0, quoteItems: 0 },
      },
    ],
  });
  const service = new HotelsService(prisma as any);
  const summary = await service.findRoomCategoriesSummary();
  assert.equal(summary[0].hotelCity, 'Amman');
});

// ---------------------------------------------------------------------------
// Critical safety guarantee — the summary path NEVER fans out to
// supplier resolution or the heavy serializeHotel pipeline.
// ---------------------------------------------------------------------------

test('findRoomCategoriesSummary: NEVER calls supplier lookup or hotel.findMany', async () => {
  const prisma = buildFakePrisma({
    categories: [
      {
        id: 'cat-1',
        hotelId: 'h-1',
        name: 'Standard',
        code: 'STD',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        hotel: { id: 'h-1', name: 'Hilton', city: 'Amman', cityRecord: null, _count: { contracts: 0 } },
        _count: { hotelRates: 0, quoteItems: 0 },
      },
    ],
  });
  const service = new HotelsService(prisma as any);
  await service.findRoomCategoriesSummary();
  const calls = (prisma as any).__calls as Array<{ model: string; method: string }>;
  assert.equal(
    calls.filter((call) => call.model === 'hotel' && call.method === 'findMany').length,
    0,
    'should NOT call hotel.findMany (that path triggers the N+1 supplier resolution)',
  );
  // hotelRoomCategory.findMany should be the only DB call we made.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'hotelRoomCategory');
});

test('findRoomCategoriesSummary: payload contains NO supplier / rate / contract blob fields', async () => {
  const prisma = buildFakePrisma({
    categories: [
      {
        id: 'cat-1',
        hotelId: 'h-1',
        name: 'Standard',
        code: 'STD',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        hotel: { id: 'h-1', name: 'Hilton', city: 'Amman', cityRecord: null, _count: { contracts: 0 } },
        _count: { hotelRates: 0, quoteItems: 0 },
      },
    ],
  });
  const service = new HotelsService(prisma as any);
  const summary = await service.findRoomCategoriesSummary();
  const serialized = JSON.stringify(summary);
  // None of the heavy fields the freeze audit identified should leak.
  for (const banned of ['supplierStatus', 'supplierName', 'rates', 'cancellationPolicy', 'allotments', 'factSheet']) {
    assert.ok(!serialized.includes(banned), `payload must not include "${banned}"`);
  }
});

// ---------------------------------------------------------------------------
// Per-category detail — only called when the operator expands a row.
// ---------------------------------------------------------------------------

test('findRoomCategoryDetail: returns counts + minimal contract list', async () => {
  const prisma = buildFakePrisma({
    category: {
      id: 'cat-1',
      hotelId: 'h-1',
      name: 'Standard',
      code: 'STD',
      description: 'Standard double room',
      isActive: true,
      hotel: { id: 'h-1', name: 'Hilton', city: 'Amman' },
      _count: { hotelRates: 12, quoteItems: 3, supplements: 2, allotments: 1 },
    },
    rateGroups: [
      { contractId: 'contract-a', _count: { _all: 8 } },
      { contractId: 'contract-b', _count: { _all: 4 } },
    ],
    contracts: [
      { id: 'contract-a', name: 'Summer 2026', validFrom: new Date('2026-06-01'), validTo: new Date('2026-08-31'), currency: 'USD', confidence: 'VERIFIED' },
      { id: 'contract-b', name: 'Winter 2026', validFrom: new Date('2026-12-01'), validTo: new Date('2027-02-28'), currency: 'USD', confidence: 'IMPORTED_UNVERIFIED' },
    ],
  });
  const service = new HotelsService(prisma as any);
  const detail = await service.findRoomCategoryDetail('cat-1');
  assert.equal(detail.counts.rates, 12);
  assert.equal(detail.counts.supplements, 2);
  assert.equal(detail.contracts.length, 2);
  // Rate counts are merged from the groupBy result, not flat-loaded.
  const summer = detail.contracts.find((c) => c.id === 'contract-a');
  assert.equal(summer?.rateCount, 8);
});

test('findRoomCategoryDetail: empty contract list when category has no rates', async () => {
  const prisma = buildFakePrisma({
    category: {
      id: 'cat-1',
      hotelId: 'h-1',
      name: 'Standard',
      code: null,
      description: null,
      isActive: true,
      hotel: { id: 'h-1', name: 'Hilton', city: 'Amman' },
      _count: { hotelRates: 0, quoteItems: 0, supplements: 0, allotments: 0 },
    },
    rateGroups: [],
    contracts: [],
  });
  const service = new HotelsService(prisma as any);
  const detail = await service.findRoomCategoryDetail('cat-1');
  assert.equal(detail.counts.rates, 0);
  assert.equal(detail.contracts.length, 0);
});

test('findRoomCategoryDetail: skips contract lookup when no rates reference the category', async () => {
  const prisma = buildFakePrisma({
    category: {
      id: 'cat-1',
      hotelId: 'h-1',
      name: 'Standard',
      code: null,
      description: null,
      isActive: true,
      hotel: { id: 'h-1', name: 'Hilton', city: 'Amman' },
      _count: { hotelRates: 0, quoteItems: 0, supplements: 0, allotments: 0 },
    },
    rateGroups: [],
  });
  const service = new HotelsService(prisma as any);
  await service.findRoomCategoryDetail('cat-1');
  const calls = (prisma as any).__calls as Array<{ model: string; method: string }>;
  // No need to hit hotelContract.findMany when there are no rate
  // groups — save the DB round trip.
  assert.equal(
    calls.filter((call) => call.model === 'hotelContract' && call.method === 'findMany').length,
    0,
  );
});
