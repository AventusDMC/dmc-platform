import test from 'node:test';
import assert from 'node:assert/strict';

import { HotelsService } from './hotels.service';

// Hotels Directory freeze fix — service-level tests for the new
// findDirectorySummary endpoint. Locks in:
//   - one row per hotel
//   - no supplier resolver fan-out (mock throws if invoked)
//   - no factSheet / roomCategories / contracts payload
//   - confidence rollup ("verified" / "needs-review" / "mixed" / "no-contracts")

function buildFakePrisma(opts: { hotels?: any[] } = {}) {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  return {
    __calls: calls,
    hotel: {
      findMany: async (args: any) => {
        calls.push({ model: 'hotel', method: 'findMany', args });
        return opts.hotels || [];
      },
    },
    supplier: {
      findUnique: async () => {
        throw new Error('Directory summary must NEVER call the supplier resolver.');
      },
    },
  };
}

const baseHotel = (overrides: any = {}) => ({
  id: 'h-1',
  name: 'Hilton Amman',
  city: 'Amman',
  category: '5*',
  supplierId: null,
  supplierName: null,
  isActive: true,
  cityRecord: null,
  hotelCategory: null,
  _count: { contracts: 0, roomCategories: 0 },
  contracts: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// findDirectorySummary — payload shape + safety
// ---------------------------------------------------------------------------

test('findDirectorySummary: returns one row per hotel with narrow fields', async () => {
  const prisma = buildFakePrisma({
    hotels: [
      baseHotel({ id: 'h-1', name: 'Hilton', city: 'Amman' }),
      baseHotel({ id: 'h-2', name: 'Movenpick', city: 'Petra' }),
    ],
  });
  const service = new HotelsService(prisma as any);
  const summary = await service.findDirectorySummary();
  assert.equal(summary.length, 2);
  assert.equal(summary[0].id, 'h-1');
  assert.equal(summary[0].name, 'Hilton');
});

test('findDirectorySummary: NEVER invokes the supplier resolver', async () => {
  const prisma = buildFakePrisma({
    hotels: [baseHotel({ supplierId: 's1', supplierName: 'Acme Suppliers' })],
  });
  const service = new HotelsService(prisma as any);
  const summary = await service.findDirectorySummary();
  // If the resolver had run, the prisma mock would have thrown.
  assert.equal(summary[0].supplierName, 'Acme Suppliers');
});

test('findDirectorySummary: payload omits heavy fields (factSheet / roomCategories / contracts blob)', async () => {
  const prisma = buildFakePrisma({
    hotels: [
      baseHotel({
        // Even if the underlying row has heavy fields, the service's
        // narrow select must keep them out of the output.
        factSheet: { highlightsJson: { foo: 'bar' } },
        roomCategories: [{ id: 'r1', name: 'Standard' }, { id: 'r2', name: 'Suite' }],
      }),
    ],
  });
  const service = new HotelsService(prisma as any);
  const summary = await service.findDirectorySummary();
  const serialized = JSON.stringify(summary);
  for (const banned of ['factSheet', 'highlightsJson', 'amenitiesJson', 'imageGalleryJson', 'roomCategories']) {
    assert.ok(!serialized.includes(banned), `payload must not include "${banned}"`);
  }
});

test('findDirectorySummary: confidence rollup is "verified" when any contract is VERIFIED', async () => {
  const prisma = buildFakePrisma({
    hotels: [
      baseHotel({
        contracts: [{ confidence: 'IMPORTED_UNVERIFIED' }, { confidence: 'VERIFIED' }],
      }),
    ],
  });
  const service = new HotelsService(prisma as any);
  const summary = await service.findDirectorySummary();
  assert.equal(summary[0].confidenceSummary, 'verified');
  assert.equal(summary[0].hasVerifiedContract, true);
});

test('findDirectorySummary: confidence rollup is "needs-review" when any contract has issues', async () => {
  const prisma = buildFakePrisma({
    hotels: [baseHotel({ contracts: [{ confidence: 'SUPPLEMENT_REVIEW_REQUIRED' }] })],
  });
  const service = new HotelsService(prisma as any);
  const summary = await service.findDirectorySummary();
  assert.equal(summary[0].confidenceSummary, 'needs-review');
  assert.equal(summary[0].hasVerifiedContract, false);
});

test('findDirectorySummary: confidence rollup is "no-contracts" when hotel has none', async () => {
  const prisma = buildFakePrisma({
    hotels: [baseHotel({ contracts: [] })],
  });
  const service = new HotelsService(prisma as any);
  const summary = await service.findDirectorySummary();
  assert.equal(summary[0].confidenceSummary, 'no-contracts');
});

test('findDirectorySummary: prefers cityRecord.name and hotelCategory.name when present', async () => {
  const prisma = buildFakePrisma({
    hotels: [
      baseHotel({
        city: 'lowercase amman',
        category: 'old',
        cityRecord: { id: 'c1', name: 'Amman' },
        hotelCategory: { id: 'cat1', name: '5-star' },
      }),
    ],
  });
  const service = new HotelsService(prisma as any);
  const summary = await service.findDirectorySummary();
  assert.equal(summary[0].city, 'Amman');
  assert.equal(summary[0].category, '5-star');
});

test('findDirectorySummary: contract + room category counts come from _count rollup', async () => {
  const prisma = buildFakePrisma({
    hotels: [baseHotel({ _count: { contracts: 5, roomCategories: 12 } })],
  });
  const service = new HotelsService(prisma as any);
  const summary = await service.findDirectorySummary();
  assert.equal(summary[0].contractCount, 5);
  assert.equal(summary[0].roomCategoryCount, 12);
});

test('findDirectorySummary: empty catalog returns empty array (no throw)', async () => {
  const prisma = buildFakePrisma({ hotels: [] });
  const service = new HotelsService(prisma as any);
  const summary = await service.findDirectorySummary();
  assert.deepEqual(summary, []);
});

test('findDirectorySummary: select clause does NOT request factSheet (regression guard)', async () => {
  const prisma = buildFakePrisma({ hotels: [baseHotel()] });
  const service = new HotelsService(prisma as any);
  await service.findDirectorySummary();
  const findManyCall = (prisma as any).__calls.find((c: any) => c.method === 'findMany');
  // Confirm we explicitly used `select` (narrow) and not `include` (eager).
  assert.ok(findManyCall.args.select, 'expected narrow `select` clause');
  // factSheet must not be selected.
  assert.equal(findManyCall.args.select.factSheet, undefined);
  // Heavy roomCategories list must not be selected — only the _count.
  assert.equal(findManyCall.args.select.roomCategories, undefined);
});

// ---------------------------------------------------------------------------
// Schema validation regression — the Hotel Prisma model has NO `isActive`
// column. The first cut of this endpoint selected `isActive: true` which
// blew up production with "Unknown field `isActive` for select statement
// on model `Hotel`". Operators saw "Page Unresponsive" because the
// admin page kept retrying the failing request.
// ---------------------------------------------------------------------------
test('findDirectorySummary: select clause does NOT request isActive (Hotel has no such field)', async () => {
  const prisma = buildFakePrisma({ hotels: [baseHotel()] });
  const service = new HotelsService(prisma as any);
  await service.findDirectorySummary();
  const findManyCall = (prisma as any).__calls.find((c: any) => c.method === 'findMany');
  assert.equal(
    findManyCall.args.select.isActive,
    undefined,
    'Hotel.isActive does not exist in the Prisma schema — selecting it triggers PrismaClientValidationError.',
  );
});

test('findDirectorySummary: select clause matches the Hotel schema (allow-list regression guard)', async () => {
  // Allow-list = every field name the Hotel model exposes today. The
  // select clause must only contain keys from this set OR known relation
  // names. Catches future drift if someone adds a `select.xyz: true`
  // without checking the schema first.
  const HOTEL_SCALAR_ALLOWLIST = new Set([
    'id',
    'name',
    'city',
    'category',
    'supplierId',
    'resolvedSupplierId',
    'supplierName',
    'createdAt',
    'updatedAt',
    'cityId',
    'hotelCategoryId',
    'preferenceRank',
  ]);
  const HOTEL_RELATION_ALLOWLIST = new Set([
    'cityRecord',
    'hotelCategory',
    'factSheet',
    'contracts',
    'rates',
    'roomCategories',
    'quoteHotelOptions',
    'quoteItems',
    'dmcQuoteHotelOptions',
    '_count',
  ]);
  const prisma = buildFakePrisma({ hotels: [baseHotel()] });
  const service = new HotelsService(prisma as any);
  await service.findDirectorySummary();
  const findManyCall = (prisma as any).__calls.find((c: any) => c.method === 'findMany');
  const selectedKeys = Object.keys(findManyCall.args.select);
  for (const key of selectedKeys) {
    const valid = HOTEL_SCALAR_ALLOWLIST.has(key) || HOTEL_RELATION_ALLOWLIST.has(key);
    assert.ok(
      valid,
      `select clause referenced "${key}" which is not a valid Hotel field. Check the Prisma schema.`,
    );
  }
});

test('findDirectorySummary: response shape preserves isActive as a derived boolean (not from DB)', async () => {
  // Existing admin consumers expect `summary[i].isActive: boolean`. The
  // backend now returns a synthesized `true` because soft-delete on Hotel
  // happens via the relational graph, not a flag. This test locks the
  // contract so the admin Next.js page keeps type-checking cleanly.
  const prisma = buildFakePrisma({ hotels: [baseHotel()] });
  const service = new HotelsService(prisma as any);
  const summary = await service.findDirectorySummary();
  assert.equal(typeof summary[0].isActive, 'boolean');
  assert.equal(summary[0].isActive, true);
});
