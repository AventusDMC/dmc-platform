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
