import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  extractMealCustomServiceName,
  runMealCustomServiceNameBackfill,
} from './backfill-meal-custom-service-name.cli';
import { OperationalVouchersService } from '../operational-documents/operational-vouchers.service';

const svcSrc = readFileSync(join(__dirname, 'quotes.service.ts'), 'utf8');
const schemaSrc = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');

// ---------------------------------------------------------------------------
// Backfill: pure extraction (anchored suffix)
// ---------------------------------------------------------------------------
test('extractMealCustomServiceName — extracts the name from a generated meal description', () => {
  assert.equal(extractMealCustomServiceName('Traditional Jordanian Dinner | Meal | PER_PERSON | 4 pax'), 'Traditional Jordanian Dinner');
  assert.equal(extractMealCustomServiceName('Petra Restaurant Lunch | Meal | PER_PERSON | 12 pax'), 'Petra Restaurant Lunch');
});

test('extractMealCustomServiceName — preserves a name that contains internal " | "', () => {
  assert.equal(
    extractMealCustomServiceName('Dinner | Bedouin Tent | Wadi Rum | Meal | PER_PERSON | 2 pax'),
    'Dinner | Bedouin Tent | Wadi Rum',
  );
});

test('extractMealCustomServiceName — skips non-matching descriptions (safe fallback null)', () => {
  for (const desc of [
    null,
    undefined,
    123 as any,
    'Petra Entrance | Entrance fee',
    'Amman → Petra | Sedan',
    'Just a name with no suffix',
    ' | Meal | PER_PERSON | 4 pax', // empty name → null
    'X | Meal | PER_PERSON | many pax', // non-numeric pax → not the exact template
    'X | Meal | PER_PERSON | 4 pax (extra)', // suffix not at end
  ]) {
    assert.equal(extractMealCustomServiceName(desc as any), null, String(desc));
  }
});

// ---------------------------------------------------------------------------
// Backfill: runner (dry-run / apply / idempotent)
// ---------------------------------------------------------------------------
function makeBackfillPrisma(rows: Array<{ id: string; pricingDescription: string | null }>) {
  const writes: Array<{ id: string; data: any }> = [];
  let lastFindWhere: any = null;
  const prisma = {
    quoteItem: {
      findMany: async ({ where }: any) => { lastFindWhere = where; return rows; },
      count: async () => 7,
      update: async ({ where, data }: any) => { writes.push({ id: where.id, data }); return {}; },
    },
  };
  return { prisma, writes, getFindWhere: () => lastFindWhere };
}

const SAMPLE_ROWS = [
  { id: 'a', pricingDescription: 'Lunch A | Meal | PER_PERSON | 4 pax' },
  { id: 'b', pricingDescription: 'Dinner | with view | Meal | PER_PERSON | 2 pax' },
  { id: 'c', pricingDescription: 'Not a meal description' }, // skipped
];

test('runBackfill dry-run: matches by anchored suffix, writes nothing', async () => {
  const { prisma, writes, getFindWhere } = makeBackfillPrisma(SAMPLE_ROWS);
  const res = await runMealCustomServiceNameBackfill(prisma as any, { apply: false });
  assert.equal(res.candidates, 3);
  assert.equal(res.matched, 2);
  assert.equal(res.skipped, 1);
  assert.equal(res.applied, 0);
  assert.equal(res.alreadyPopulated, 7);
  assert.equal(writes.length, 0); // dry-run = no writes
  // Idempotent + targeted: only null rows are queried.
  assert.equal(getFindWhere().customServiceName, null);
});

test('runBackfill apply: writes only matched rows with the extracted name', async () => {
  const { prisma, writes } = makeBackfillPrisma(SAMPLE_ROWS);
  const res = await runMealCustomServiceNameBackfill(prisma as any, { apply: true });
  assert.equal(res.applied, 2);
  assert.deepEqual(writes, [
    { id: 'a', data: { customServiceName: 'Lunch A' } },
    { id: 'b', data: { customServiceName: 'Dinner | with view' } },
  ]);
});

// ---------------------------------------------------------------------------
// Write path (source-grep): schema column + resolve emit + values.data, with
// pricingDescription generation unchanged.
// ---------------------------------------------------------------------------
test('schema adds nullable customServiceName column', () => {
  assert.ok(/customServiceName\s+String\?/.test(schemaSrc), 'schema must declare customServiceName String?');
});

test('meal resolve persists customServiceName but leaves pricingDescription template unchanged', () => {
  // The meal name is captured for the new column…
  assert.ok(svcSrc.includes('resolvedCustomServiceName = mealName;'), 'meal branch must set resolvedCustomServiceName');
  // …and emitted into the persisted values.data…
  assert.ok(svcSrc.includes('customServiceName: resolvedCustomServiceName,'), 'values.data must include customServiceName');
  // …while the meal pricingDescription template is byte-for-byte unchanged.
  assert.ok(
    svcSrc.includes('pricingDescription = `${mealName} | Meal | PER_PERSON | ${paxCount} pax`;'),
    'meal pricingDescription template must be unchanged',
  );
  // Default is null (non-meal items leave it null → inert).
  assert.ok(svcSrc.includes('let resolvedCustomServiceName: string | null = null;'), 'must default to null for non-meal items');
});

// ---------------------------------------------------------------------------
// Operational voucher side effect (intended): meal name shows when stored.
// ---------------------------------------------------------------------------
test('voucher shows stored meal customServiceName when present, falls back otherwise', () => {
  const svc = new OperationalVouchersService({} as any);
  const build = (item: any) => (svc as any).buildQuoteServiceVoucherSection(item, []);

  const withName = build({
    customServiceName: 'Traditional Jordanian Dinner',
    service: { name: 'Generic Dining Service', category: 'Dining', serviceType: { name: 'Dining' } },
  });
  assert.equal(withName.name, 'Traditional Jordanian Dinner');

  const withoutName = build({
    customServiceName: null,
    service: { name: 'Generic Dining Service', category: 'Dining', serviceType: { name: 'Dining' } },
  });
  assert.equal(withoutName.name, 'Generic Dining Service');

  const withNeither = build({ customServiceName: null, service: null });
  assert.equal(withNeither.name, 'Operational service');
});
