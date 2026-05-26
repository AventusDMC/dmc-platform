import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canMarkVerified,
  computeHealthScore,
  diffContractSnapshots,
  interpretRates,
  isPricingComplete,
  recommendConfidence,
  suggestRoomMappings,
  validateSeasons,
  validateSupplements,
  type RateInput,
  type SeasonInput,
  type SupplementInput,
} from './hotel-contract-health.validators';

// Hotel Contract Stabilization & Trustworthiness v2 — pure validator
// tests. Goal: every validator is fed plain data and returns structured
// findings that the dashboard / queue / per-contract endpoints surface.

// ---------------------------------------------------------------------------
// Room mapping suggestions
// ---------------------------------------------------------------------------
test('suggestRoomMappings: "Junior Suite" → SUITE high-confidence', () => {
  const out = suggestRoomMappings('Junior Suite');
  assert.deepEqual(out.suggestedCategories, ['SUITE']);
  assert.equal(out.confidence, 'high');
});

test('suggestRoomMappings: "Family Room" → FAMILY / QUAD high-confidence', () => {
  const out = suggestRoomMappings('Family Room');
  assert.deepEqual(out.suggestedCategories, ['FAMILY', 'QUAD']);
  assert.equal(out.confidence, 'high');
});

test('suggestRoomMappings: "Twin Deluxe" → TWIN / DBL high-confidence', () => {
  const out = suggestRoomMappings('Twin Deluxe');
  assert.deepEqual(out.suggestedCategories, ['TWIN', 'DBL']);
  assert.equal(out.confidence, 'high');
});

test('suggestRoomMappings: "Classic Mountain View" → low-confidence DBL/TWIN fallback', () => {
  const out = suggestRoomMappings('Classic Mountain View');
  assert.deepEqual(out.suggestedCategories, ['DBL', 'TWIN']);
  assert.equal(out.confidence, 'low');
});

test('suggestRoomMappings: empty string returns low-confidence empty list', () => {
  const out = suggestRoomMappings('');
  assert.deepEqual(out.suggestedCategories, []);
  assert.equal(out.confidence, 'low');
});

// ---------------------------------------------------------------------------
// Supplement validation
// ---------------------------------------------------------------------------
function buildSupplement(overrides: Partial<SupplementInput> = {}): SupplementInput {
  return {
    id: overrides.id || `supp-${Math.random().toString(36).slice(2, 7)}`,
    type: overrides.type || 'EXTRA_BED',
    roomCategoryId: 'roomCategoryId' in overrides ? overrides.roomCategoryId! : null,
    chargeBasis: 'chargeBasis' in overrides ? overrides.chargeBasis! : 'PER_NIGHT',
    amount: 'amount' in overrides ? overrides.amount! : 10,
    isMandatory: overrides.isMandatory ?? false,
    isActive: overrides.isActive ?? true,
  };
}

test('validateSupplements: detects duplicate type within same room scope', () => {
  const supplements = [
    buildSupplement({ id: 's1', type: 'EXTRA_BREAKFAST', roomCategoryId: 'r1' }),
    buildSupplement({ id: 's2', type: 'EXTRA_BREAKFAST', roomCategoryId: 'r1' }),
  ];
  const findings = validateSupplements(supplements);
  const dup = findings.find((f) => f.kind === 'DUPLICATE_TYPE_SAME_ROOM');
  assert.ok(dup, 'expected DUPLICATE_TYPE_SAME_ROOM finding');
  assert.equal(dup!.severity, 'high');
  assert.deepEqual(dup!.supplementIds.sort(), ['s1', 's2']);
});

test('validateSupplements: HB included + EXTRA_DINNER supplement raises high-severity warning', () => {
  const supplements = [buildSupplement({ id: 's1', type: 'EXTRA_DINNER' })];
  const findings = validateSupplements(supplements, { rateMealPlans: ['HB', 'BB'] });
  assert.ok(findings.some((f) => f.kind === 'HB_INCLUDED_AND_HB_SUPPLEMENT'));
});

test('validateSupplements: HB context with no EXTRA_DINNER supplement does NOT warn', () => {
  const supplements = [buildSupplement({ id: 's1', type: 'EXTRA_BED' })];
  const findings = validateSupplements(supplements, { rateMealPlans: ['HB'] });
  assert.ok(!findings.some((f) => f.kind === 'HB_INCLUDED_AND_HB_SUPPLEMENT'));
});

test('validateSupplements: missing chargeBasis is medium severity', () => {
  const supplements = [buildSupplement({ id: 's1', chargeBasis: null })];
  const findings = validateSupplements(supplements);
  const missingBasis = findings.find((f) => f.kind === 'MISSING_PRICING_BASIS');
  assert.ok(missingBasis);
  assert.equal(missingBasis!.severity, 'medium');
});

test('validateSupplements: inconsistent scope flagged when same type is global AND room-scoped', () => {
  const supplements = [
    buildSupplement({ id: 's1', type: 'EXTRA_BREAKFAST', roomCategoryId: null }),
    buildSupplement({ id: 's2', type: 'EXTRA_BREAKFAST', roomCategoryId: 'r1' }),
  ];
  const findings = validateSupplements(supplements);
  assert.ok(findings.some((f) => f.kind === 'INCONSISTENT_SCOPE'));
});

test('validateSupplements: invalid amount flagged as high severity', () => {
  const supplements = [buildSupplement({ id: 's1', amount: null })];
  const findings = validateSupplements(supplements);
  const missing = findings.find((f) => f.kind === 'MISSING_AMOUNT');
  assert.ok(missing);
  assert.equal(missing!.severity, 'high');
});

test('validateSupplements: inactive rows are ignored', () => {
  const supplements = [
    buildSupplement({ id: 's1', type: 'EXTRA_BREAKFAST', isActive: false }),
    buildSupplement({ id: 's2', type: 'EXTRA_BREAKFAST', isActive: false }),
  ];
  const findings = validateSupplements(supplements);
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// Season validation
// ---------------------------------------------------------------------------
function buildSeason(overrides: Partial<SeasonInput> = {}): SeasonInput {
  return {
    id: overrides.id || `season-${Math.random().toString(36).slice(2, 7)}`,
    name: overrides.name || 'Standard',
    validFrom: overrides.validFrom || '2026-01-01',
    validTo: overrides.validTo || '2026-12-31',
  };
}

test('validateSeasons: detects overlapping seasons', () => {
  const seasons = [
    buildSeason({ id: 'a', name: 'High', validFrom: '2026-06-01', validTo: '2026-09-30' }),
    buildSeason({ id: 'b', name: 'Shoulder', validFrom: '2026-09-15', validTo: '2026-11-30' }),
  ];
  const findings = validateSeasons(seasons);
  assert.ok(findings.some((f) => f.kind === 'OVERLAPPING_SEASONS'));
});

test('validateSeasons: detects gaps within contract validity', () => {
  const seasons = [
    buildSeason({ id: 'a', name: 'Q1', validFrom: '2026-01-01', validTo: '2026-03-31' }),
    buildSeason({ id: 'b', name: 'Q3', validFrom: '2026-07-01', validTo: '2026-09-30' }),
  ];
  const findings = validateSeasons(seasons, { validFrom: '2026-01-01', validTo: '2026-12-31' });
  assert.ok(findings.some((f) => f.kind === 'GAP_IN_VALIDITY'));
});

test('validateSeasons: duplicate name with different ranges flagged', () => {
  const seasons = [
    buildSeason({ id: 'a', name: 'Summer', validFrom: '2026-06-01', validTo: '2026-08-31' }),
    buildSeason({ id: 'b', name: 'Summer', validFrom: '2026-09-01', validTo: '2026-10-15' }),
  ];
  const findings = validateSeasons(seasons);
  assert.ok(findings.some((f) => f.kind === 'DUPLICATE_NAME_DIFFERENT_RANGE'));
});

test('validateSeasons: invalid range (from > to) is high severity', () => {
  const seasons = [buildSeason({ id: 'a', validFrom: '2026-12-31', validTo: '2026-01-01' })];
  const findings = validateSeasons(seasons);
  const invalid = findings.find((f) => f.kind === 'INVALID_RANGE');
  assert.ok(invalid);
  assert.equal(invalid!.severity, 'high');
});

test('validateSeasons: clean non-overlapping continuous range produces zero findings', () => {
  const seasons = [
    buildSeason({ id: 'a', name: 'Q1', validFrom: '2026-01-01', validTo: '2026-03-31' }),
    buildSeason({ id: 'b', name: 'Q2', validFrom: '2026-04-01', validTo: '2026-06-30' }),
  ];
  const findings = validateSeasons(seasons, { validFrom: '2026-01-01', validTo: '2026-06-30' });
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// Pricing interpretation preview
// ---------------------------------------------------------------------------
test('interpretRates: surfaces "Open season" when seasonName is empty', () => {
  const rates: RateInput[] = [
    {
      id: 'r1',
      roomCategoryId: 'rc1',
      occupancyType: 'DBL',
      mealPlan: 'BB',
      seasonName: '',
      seasonFrom: null,
      seasonTo: null,
      cost: 100,
      currency: 'USD',
    },
  ];
  const interpretations = interpretRates(rates);
  assert.equal(interpretations[0].reads.season, 'Open season');
  assert.ok(interpretations[0].warnings.includes('Season name missing — will display as "Open season".'));
});

test('interpretRates: flags missing pricingBasis with explicit fallback', () => {
  const rates: RateInput[] = [
    {
      id: 'r1',
      roomCategoryId: 'rc1',
      occupancyType: 'DBL',
      mealPlan: 'BB',
      seasonName: 'Standard',
      seasonFrom: '2026-01-01',
      seasonTo: '2026-12-31',
      cost: 100,
      currency: 'USD',
      pricingBasis: null,
    },
  ];
  const interpretations = interpretRates(rates);
  assert.equal(interpretations[0].reads.pricingBasis, 'PER_ROOM (default)');
});

// ---------------------------------------------------------------------------
// Re-upload diff
// ---------------------------------------------------------------------------
test('diffContractSnapshots: detects added / removed / changed rates', () => {
  const baseRate = (overrides: Partial<RateInput> = {}): RateInput => ({
    id: overrides.id || 'r',
    roomCategoryId: overrides.roomCategoryId || 'rc1',
    occupancyType: overrides.occupancyType || 'DBL',
    mealPlan: overrides.mealPlan || 'BB',
    seasonName: overrides.seasonName || 'High',
    seasonFrom: overrides.seasonFrom || '2026-06-01',
    seasonTo: overrides.seasonTo || '2026-09-30',
    cost: overrides.cost ?? 100,
    currency: overrides.currency || 'USD',
  });
  const diff = diffContractSnapshots(
    {
      roomCategories: [{ id: 'rc1', name: 'Std', code: 'STD', isActive: true }],
      rates: [baseRate({ id: 'r-kept', cost: 100 }), baseRate({ id: 'r-removed', seasonName: 'Low', cost: 60 })],
      supplements: [],
      seasons: [],
    },
    {
      roomCategories: [{ id: 'rc1', name: 'Std', code: 'STD', isActive: true }],
      rates: [baseRate({ id: 'r-kept', cost: 150 }), baseRate({ id: 'r-new', seasonName: 'Shoulder', cost: 90 })],
      supplements: [],
      seasons: [],
    },
  );
  assert.equal(diff.summary.addedCount, 1);
  assert.equal(diff.summary.removedCount, 1);
  assert.equal(diff.summary.changedCount, 1);
});

test('diffContractSnapshots: flags >50% price moves as suspicious', () => {
  const buildRate = (cost: number): RateInput => ({
    id: 'r1',
    roomCategoryId: 'rc1',
    occupancyType: 'DBL',
    mealPlan: 'BB',
    seasonName: 'High',
    seasonFrom: '2026-06-01',
    seasonTo: '2026-09-30',
    cost,
    currency: 'USD',
  });
  const diff = diffContractSnapshots(
    { roomCategories: [], rates: [buildRate(100)], supplements: [], seasons: [] },
    { roomCategories: [], rates: [buildRate(200)], supplements: [], seasons: [] },
  );
  assert.ok(
    diff.summary.suspicious.some((entry) => entry.toLowerCase().includes('moved by')),
    'expected suspicious entry for >50% change',
  );
});

test('diffContractSnapshots: removed room categories raise historical-quotes warning', () => {
  const diff = diffContractSnapshots(
    {
      roomCategories: [{ id: 'rc1', name: 'Std', code: 'STD', isActive: true }],
      rates: [],
      supplements: [],
      seasons: [],
    },
    { roomCategories: [], rates: [], supplements: [], seasons: [] },
  );
  assert.ok(diff.summary.suspicious.some((s) => s.toLowerCase().includes('soft-deactivate')));
});

// ---------------------------------------------------------------------------
// Confidence recommendation
// ---------------------------------------------------------------------------
test('recommendConfidence: high-severity season finding → SEASON_CONFLICT', () => {
  const out = recommendConfidence({
    currentStatus: 'IMPORTED_UNVERIFIED',
    supplementFindings: [],
    seasonFindings: [
      { kind: 'OVERLAPPING_SEASONS', severity: 'high', message: 'overlap', seasonIds: ['a', 'b'] },
    ],
    pricingComplete: true,
  });
  assert.equal(out.recommended, 'SEASON_CONFLICT');
});

test('recommendConfidence: high-severity supplement finding → SUPPLEMENT_REVIEW_REQUIRED', () => {
  const out = recommendConfidence({
    currentStatus: 'IMPORTED_UNVERIFIED',
    supplementFindings: [
      { kind: 'DUPLICATE_TYPE_SAME_ROOM', severity: 'high', message: 'dup', supplementIds: ['a'] },
    ],
    seasonFindings: [],
    pricingComplete: true,
  });
  assert.equal(out.recommended, 'SUPPLEMENT_REVIEW_REQUIRED');
});

test('recommendConfidence: pricing incomplete → PRICING_INCOMPLETE', () => {
  const out = recommendConfidence({
    currentStatus: 'IMPORTED_UNVERIFIED',
    supplementFindings: [],
    seasonFindings: [],
    pricingComplete: false,
  });
  assert.equal(out.recommended, 'PRICING_INCOMPLETE');
});

test('recommendConfidence: VERIFIED status is never auto-downgraded', () => {
  const out = recommendConfidence({
    currentStatus: 'VERIFIED',
    supplementFindings: [
      { kind: 'DUPLICATE_TYPE_SAME_ROOM', severity: 'high', message: 'dup', supplementIds: ['a'] },
    ],
    seasonFindings: [],
    pricingComplete: false,
  });
  assert.equal(out.recommended, 'VERIFIED');
});

// ---------------------------------------------------------------------------
// Pricing completeness
// ---------------------------------------------------------------------------
test('isPricingComplete: missing room x occupancy x meal-plan combo reported', () => {
  const result = isPricingComplete(
    ['rc1', 'rc2'],
    [
      {
        id: 'r1',
        roomCategoryId: 'rc1',
        occupancyType: 'DBL',
        mealPlan: 'BB',
        seasonName: 'High',
        seasonFrom: null,
        seasonTo: null,
        cost: 100,
        currency: 'USD',
      },
    ],
  );
  // Only rc1 / DBL / BB exists. rc2 / DBL / BB is missing.
  assert.equal(result.complete, false);
  assert.ok(result.missing.some((m) => m.roomCategoryId === 'rc2'));
});

test('isPricingComplete: returns false when no rates exist at all', () => {
  const result = isPricingComplete(['rc1'], []);
  assert.equal(result.complete, false);
});

// ---------------------------------------------------------------------------
// VERIFIED gating (Correction Workspace v1)
// ---------------------------------------------------------------------------
test('canMarkVerified: blocks promotion when high-severity supplement findings exist', () => {
  const result = canMarkVerified({
    supplementFindings: [
      { kind: 'DUPLICATE_TYPE_SAME_ROOM', severity: 'high', message: 'dup', supplementIds: ['a', 'b'] },
    ],
    seasonFindings: [],
    pricingCompleteness: { complete: true, missingCount: 0, totalExpected: 10 },
    rateCount: 10,
  });
  assert.equal(result.allowed, false);
  assert.ok(result.blockers.some((b) => b.toLowerCase().includes('supplement')));
});

test('canMarkVerified: blocks promotion when high-severity season findings exist', () => {
  const result = canMarkVerified({
    supplementFindings: [],
    seasonFindings: [
      { kind: 'OVERLAPPING_SEASONS', severity: 'high', message: 'overlap', seasonIds: ['x', 'y'] },
    ],
    pricingCompleteness: { complete: true, missingCount: 0, totalExpected: 10 },
    rateCount: 10,
  });
  assert.equal(result.allowed, false);
  assert.ok(result.blockers.some((b) => b.toLowerCase().includes('season')));
});

test('canMarkVerified: blocks promotion when no rate rows exist', () => {
  const result = canMarkVerified({
    supplementFindings: [],
    seasonFindings: [],
    pricingCompleteness: { complete: true, missingCount: 0, totalExpected: 0 },
    rateCount: 0,
  });
  assert.equal(result.allowed, false);
  assert.ok(result.blockers.some((b) => b.toLowerCase().includes('no rate')));
});

test('canMarkVerified: pricing completeness below 80% blocks; above 80% warns', () => {
  // Below 80% → blocked
  const blocked = canMarkVerified({
    supplementFindings: [],
    seasonFindings: [],
    pricingCompleteness: { complete: false, missingCount: 30, totalExpected: 100 },
    rateCount: 70,
  });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.blockers.some((b) => b.toLowerCase().includes('completeness')));

  // Above 80% but not complete → allowed with warning
  const warned = canMarkVerified({
    supplementFindings: [],
    seasonFindings: [],
    pricingCompleteness: { complete: false, missingCount: 10, totalExpected: 100 },
    rateCount: 90,
  });
  assert.equal(warned.allowed, true);
  assert.ok(warned.warnings.length > 0);
});

test('canMarkVerified: allows promotion when clean (no findings, complete pricing, ≥1 rate)', () => {
  const result = canMarkVerified({
    supplementFindings: [],
    seasonFindings: [],
    pricingCompleteness: { complete: true, missingCount: 0, totalExpected: 10 },
    rateCount: 10,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.blockers.length, 0);
});

test('canMarkVerified: medium findings surface as warnings (not blockers)', () => {
  const result = canMarkVerified({
    supplementFindings: [
      { kind: 'MISSING_PRICING_BASIS', severity: 'medium', message: 'basis', supplementIds: ['a'] },
    ],
    seasonFindings: [
      { kind: 'GAP_IN_VALIDITY', severity: 'medium', message: 'gap', seasonIds: ['x', 'y'] },
    ],
    pricingCompleteness: { complete: true, missingCount: 0, totalExpected: 10 },
    rateCount: 10,
  });
  assert.equal(result.allowed, true);
  assert.ok(result.warnings.length >= 2);
});

// ---------------------------------------------------------------------------
// Health score
// ---------------------------------------------------------------------------
test('computeHealthScore: starts at 100 with clean inputs', () => {
  const score = computeHealthScore({
    supplementFindings: [],
    seasonFindings: [],
    pricingCompleteness: { complete: true, missingCount: 0, totalExpected: 10 },
  });
  assert.equal(score, 100);
});

test('computeHealthScore: 25 points per high-severity finding', () => {
  const score = computeHealthScore({
    supplementFindings: [
      { kind: 'DUPLICATE_TYPE_SAME_ROOM', severity: 'high', message: '', supplementIds: [] },
    ],
    seasonFindings: [],
    pricingCompleteness: { complete: true, missingCount: 0, totalExpected: 10 },
  });
  assert.equal(score, 75);
});

test('computeHealthScore: clamps to 0 even with many findings', () => {
  const score = computeHealthScore({
    supplementFindings: Array.from({ length: 10 }, (_, i) => ({
      kind: 'DUPLICATE_TYPE_SAME_ROOM' as const,
      severity: 'high' as const,
      message: '',
      supplementIds: [`s-${i}`],
    })),
    seasonFindings: [],
    pricingCompleteness: { complete: true, missingCount: 0, totalExpected: 10 },
  });
  assert.equal(score, 0);
});

test('computeHealthScore: incomplete pricing subtracts proportionally up to 30', () => {
  // 100% missing → -30 (capped)
  const all = computeHealthScore({
    supplementFindings: [],
    seasonFindings: [],
    pricingCompleteness: { complete: false, missingCount: 10, totalExpected: 10 },
  });
  assert.equal(all, 70);
  // 50% missing → -15
  const half = computeHealthScore({
    supplementFindings: [],
    seasonFindings: [],
    pricingCompleteness: { complete: false, missingCount: 5, totalExpected: 10 },
  });
  assert.equal(half, 85);
});
