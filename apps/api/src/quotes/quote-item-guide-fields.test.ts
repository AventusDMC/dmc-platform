import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseGuidePricingDescription,
  runGuideFieldsBackfill,
} from './backfill-quote-item-guide-fields.cli';
import { QuotesService } from './quotes.service';
import { QuotePricingService } from './quote-pricing.service';

const svcSrc = readFileSync(join(__dirname, 'quotes.service.ts'), 'utf8');
const schemaSrc = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');

// ---------------------------------------------------------------------------
// Backfill: pure parse (anchored full-string template → canonical values)
// ---------------------------------------------------------------------------
test('parseGuidePricingDescription — Local/Escort + Half/Full day + Overnight Yes/No', () => {
  assert.deepEqual(parseGuidePricingDescription('Guide | Local | Full day | Overnight: No'), {
    guideType: 'local', guideDuration: 'full_day', guideOvernight: false,
  });
  assert.deepEqual(parseGuidePricingDescription('Guide | Local | Half day | Overnight: Yes'), {
    guideType: 'local', guideDuration: 'half_day', guideOvernight: true,
  });
  assert.deepEqual(parseGuidePricingDescription('Guide | Escort | Full day | Overnight: Yes'), {
    guideType: 'escort', guideDuration: 'full_day', guideOvernight: true,
  });
  assert.deepEqual(parseGuidePricingDescription('Guide | Escort | Half day | Overnight: No'), {
    guideType: 'escort', guideDuration: 'half_day', guideOvernight: false,
  });
});

test('parseGuidePricingDescription — non-matching / partial descriptions return null (safe fallback)', () => {
  for (const desc of [
    null,
    undefined,
    123 as any,
    '',
    'Guide | Local | Full day', // missing overnight segment
    'Guide | Local | Full day | Overnight: Maybe', // bad overnight token
    'Guide | Driver | Full day | Overnight: No', // bad type token
    'Guide | Local | All day | Overnight: No', // bad duration token
    'Guide | Local | Full day | Overnight: No | extra', // trailing content
    'prefix Guide | Local | Full day | Overnight: No', // leading content (not anchored)
    'Amman → Petra | Sedan', // unrelated transport descriptor
    'Lunch | Meal | PER_PERSON | 4 pax', // unrelated meal descriptor
  ]) {
    assert.equal(parseGuidePricingDescription(desc as any), null, String(desc));
  }
});

// ---------------------------------------------------------------------------
// Backfill: runner (dry-run / apply / idempotent — only guideType-null rows)
// ---------------------------------------------------------------------------
function makeBackfillPrisma(rows: Array<{ id: string; pricingDescription: string | null }>) {
  const writes: Array<{ id: string; data: any }> = [];
  let lastFindWhere: any = null;
  const prisma = {
    quoteItem: {
      findMany: async ({ where }: any) => { lastFindWhere = where; return rows; },
      count: async () => 3,
      update: async ({ where, data }: any) => { writes.push({ id: where.id, data }); return {}; },
    },
  };
  return { prisma, writes, getFindWhere: () => lastFindWhere };
}

const SAMPLE_ROWS = [
  { id: 'a', pricingDescription: 'Guide | Local | Full day | Overnight: No' },
  { id: 'b', pricingDescription: 'Guide | Escort | Half day | Overnight: Yes' },
  { id: 'c', pricingDescription: 'Guide | Local | Full day | Overnight: Maybe' }, // skipped (bad token)
];

test('runGuideFieldsBackfill dry-run: matches by anchored template, writes nothing, queries only null rows', async () => {
  const { prisma, writes, getFindWhere } = makeBackfillPrisma(SAMPLE_ROWS);
  const res = await runGuideFieldsBackfill(prisma as any, { apply: false });
  assert.equal(res.candidates, 3);
  assert.equal(res.matched, 2);
  assert.equal(res.skipped, 1);
  assert.equal(res.applied, 0);
  assert.equal(res.alreadyPopulated, 3);
  assert.equal(writes.length, 0); // dry-run = zero writes
  // Idempotent + targeted: only guideType-null rows are queried.
  assert.equal(getFindWhere().guideType, null);
  assert.deepEqual(getFindWhere().pricingDescription, { startsWith: 'Guide | ' });
});

test('runGuideFieldsBackfill apply: writes the three canonical fields for matched rows only', async () => {
  const { prisma, writes } = makeBackfillPrisma(SAMPLE_ROWS);
  const res = await runGuideFieldsBackfill(prisma as any, { apply: true });
  assert.equal(res.applied, 2);
  assert.deepEqual(writes, [
    { id: 'a', data: { guideType: 'local', guideDuration: 'full_day', guideOvernight: false } },
    { id: 'b', data: { guideType: 'escort', guideDuration: 'half_day', guideOvernight: true } },
  ]);
});

test('runGuideFieldsBackfill is idempotent: a second run over already-populated rows matches nothing', async () => {
  // Re-running queries WHERE guideType IS NULL; populated rows are excluded by the
  // query, so a run that sees no null rows applies nothing.
  const { prisma, writes } = makeBackfillPrisma([]);
  const res = await runGuideFieldsBackfill(prisma as any, { apply: true });
  assert.equal(res.candidates, 0);
  assert.equal(res.applied, 0);
  assert.equal(writes.length, 0);
});

// ---------------------------------------------------------------------------
// Schema + write path (source-grep): columns added, resolve emits them, and the
// guide pricingDescription template is byte-for-byte unchanged.
// ---------------------------------------------------------------------------
test('schema adds nullable guideType/guideDuration/guideOvernight columns on QuoteItem', () => {
  assert.ok(/guideType\s+String\?/.test(schemaSrc), 'schema must declare guideType String?');
  assert.ok(/guideDuration\s+String\?/.test(schemaSrc), 'schema must declare guideDuration String?');
  assert.ok(/guideOvernight\s+Boolean\?/.test(schemaSrc), 'schema must declare guideOvernight Boolean?');
});

test('guide resolve persists the three guide fields but leaves pricingDescription template unchanged', () => {
  // Captured for the new columns…
  assert.ok(svcSrc.includes('resolvedGuideType = guideType;'), 'guide branch must set resolvedGuideType');
  assert.ok(svcSrc.includes('resolvedGuideDuration = guideDuration;'), 'guide branch must set resolvedGuideDuration');
  assert.ok(svcSrc.includes('resolvedGuideOvernight = overnight;'), 'guide branch must set resolvedGuideOvernight');
  // …emitted into the persisted values.data…
  assert.ok(svcSrc.includes('guideType: resolvedGuideType,'), 'values.data must include guideType');
  assert.ok(svcSrc.includes('guideDuration: resolvedGuideDuration,'), 'values.data must include guideDuration');
  assert.ok(svcSrc.includes('guideOvernight: resolvedGuideOvernight,'), 'values.data must include guideOvernight');
  // …while the guide pricingDescription template is byte-for-byte unchanged.
  assert.ok(
    svcSrc.includes(
      'pricingDescription = `Guide | ${this.formatGuideType(guideType)} | ${this.formatGuideDuration(guideDuration)} | Overnight: ${overnight ? \'Yes\' : \'No\'}`;',
    ),
    'guide pricingDescription template must be unchanged',
  );
  // …and the GUIDE_RATES cost formula is unchanged.
  assert.ok(
    svcSrc.includes('baseCost = GUIDE_RATES[guideType][guideDuration] + (overnight ? GUIDE_OVERNIGHT_SUPPLEMENT : 0);'),
    'guide cost formula must be unchanged',
  );
  // Defaults are null (non-guide items leave them null → inert).
  assert.ok(svcSrc.includes('let resolvedGuideType: string | null = null;'), 'guideType defaults null for non-guide items');
  assert.ok(svcSrc.includes('let resolvedGuideDuration: string | null = null;'), 'guideDuration defaults null');
  assert.ok(svcSrc.includes('let resolvedGuideOvernight: boolean | null = null;'), 'guideOvernight defaults null');
});

// ---------------------------------------------------------------------------
// Edit-merge behavior (behavioral): buildQuoteItemUpdateResolveInput preserves
// existing guide columns when omitted, overrides when sent, and yields undefined
// for non-guide items (so the guide-compat guard is not tripped).
// ---------------------------------------------------------------------------
function makeMergeService() {
  return new QuotesService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    new QuotePricingService(),
  );
}

test('edit-merge: guide update preserves existing guide columns when fields are omitted', () => {
  const svc = makeMergeService() as any;
  const existing = {
    serviceId: 's1',
    guideType: 'escort',
    guideDuration: 'full_day',
    guideOvernight: true,
  };
  const merged = svc.buildQuoteItemUpdateResolveInput(existing, { quantity: 1 }, 'q1', undefined);
  assert.equal(merged.guideType, 'escort');
  assert.equal(merged.guideDuration, 'full_day');
  assert.equal(merged.overnight, true);
});

test('edit-merge: guide update overrides with sent values', () => {
  const svc = makeMergeService() as any;
  const existing = { serviceId: 's1', guideType: 'escort', guideDuration: 'full_day', guideOvernight: true };
  const merged = svc.buildQuoteItemUpdateResolveInput(
    existing,
    { quantity: 1, guideType: 'local', guideDuration: 'half_day', overnight: false },
    'q1',
    undefined,
  );
  assert.equal(merged.guideType, 'local');
  assert.equal(merged.guideDuration, 'half_day');
  assert.equal(merged.overnight, false);
});

test('edit-merge: non-guide item with null columns resolves guide fields to undefined (no false guide-validation)', () => {
  const svc = makeMergeService() as any;
  const existing = { serviceId: 's1', guideType: null, guideDuration: null, guideOvernight: null };
  const merged = svc.buildQuoteItemUpdateResolveInput(existing, { quantity: 1 }, 'q1', undefined);
  assert.equal(merged.guideType, undefined);
  assert.equal(merged.guideDuration, undefined);
  assert.equal(merged.overnight, undefined);
});
