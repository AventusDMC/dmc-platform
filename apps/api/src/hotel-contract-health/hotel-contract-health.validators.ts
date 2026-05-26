// Hotel Contract Stabilization & Trustworthiness v2 — pure validators.
//
// These functions take plain data (no Prisma client, no DI) and return
// structured findings. The HotelContractHealthService composes them
// into the Dashboard / Correction Queue / Per-contract validation
// endpoints. Keeping them pure means:
//   - Tests don't need DB fixtures.
//   - The same validators can run during import (pre-save preview)
//     AND post-import (health dashboard scan) without duplication.
//   - The pricing engine never sees them — they're a parallel
//     trustworthiness layer that observes contracts, never mutates
//     pricing.

// ---------------------------------------------------------------------------
// Shared input shapes — match what HotelContractsService.findOne returns,
// stripped to the fields each validator actually reads. Keeping the
// shapes narrow makes the test fixtures small and forces the service
// to think about what data the validators need.
// ---------------------------------------------------------------------------

export type RoomCategoryInput = {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
};

export type RateInput = {
  id: string;
  roomCategoryId: string;
  occupancyType: 'SGL' | 'DBL' | 'TPL' | string;
  mealPlan: 'RO' | 'BB' | 'HB' | 'FB' | 'AI' | string;
  seasonName: string;
  seasonFrom: Date | string | null | undefined;
  seasonTo: Date | string | null | undefined;
  cost: number;
  pricingBasis?: 'PER_PERSON' | 'PER_ROOM' | string | null;
  currency: string;
};

export type SupplementInput = {
  id: string;
  type: string;
  roomCategoryId: string | null;
  chargeBasis: string | null;
  amount: number | string | null;
  isMandatory: boolean;
  isActive: boolean;
};

export type SeasonInput = {
  id: string;
  name: string;
  validFrom: Date | string;
  validTo: Date | string;
};

// ---------------------------------------------------------------------------
// Room Mapping — map free-text imported room labels to standard
// occupancy categories. Pure suggestion engine — the operator always
// makes the final call.
// ---------------------------------------------------------------------------

export type StandardRoomCategory = 'SGL' | 'DBL' | 'TWIN' | 'TPL' | 'QUAD' | 'SUITE' | 'FAMILY';

export const STANDARD_ROOM_CATEGORIES: StandardRoomCategory[] = [
  'SGL',
  'DBL',
  'TWIN',
  'TPL',
  'QUAD',
  'SUITE',
  'FAMILY',
];

export type RoomMappingSuggestion = {
  sourceName: string;
  suggestedCategories: StandardRoomCategory[];
  confidence: 'high' | 'medium' | 'low';
  reason: string;
};

/**
 * Suggest standard room categories that a free-text imported room name
 * could map to. Heuristic only — operator confirms in the UI.
 *
 * Example: "Classic Mountain View" → likely DBL or TWIN (no keyword
 * uniquely picks one); "Junior Suite" → SUITE high-confidence;
 * "Family Room" → FAMILY high-confidence.
 */
export function suggestRoomMappings(sourceName: string): RoomMappingSuggestion {
  const normalized = String(sourceName || '').toLowerCase().trim();
  if (!normalized) {
    return {
      sourceName: '',
      suggestedCategories: [],
      confidence: 'low',
      reason: 'Empty source name — operator must map manually.',
    };
  }

  // High-confidence keyword hits.
  if (/\bsuite\b|\bjr\.?\s+suite|junior\s+suite/i.test(normalized)) {
    return {
      sourceName,
      suggestedCategories: ['SUITE'],
      confidence: 'high',
      reason: 'Name contains "suite" — maps to SUITE.',
    };
  }
  if (/\bfamily\b|\bfamilial\b/i.test(normalized)) {
    return {
      sourceName,
      suggestedCategories: ['FAMILY', 'QUAD'],
      confidence: 'high',
      reason: 'Name contains "family" — typically FAMILY or QUAD occupancy.',
    };
  }
  if (/\bsingle\b|\bsgl\b|\b1\s*pax\b/i.test(normalized)) {
    return {
      sourceName,
      suggestedCategories: ['SGL'],
      confidence: 'high',
      reason: 'Name signals single occupancy.',
    };
  }
  if (/\btriple\b|\btpl\b|\b3\s*pax\b/i.test(normalized)) {
    return {
      sourceName,
      suggestedCategories: ['TPL'],
      confidence: 'high',
      reason: 'Name signals triple occupancy.',
    };
  }
  if (/\bquad\b|\bquadruple\b|\b4\s*pax\b/i.test(normalized)) {
    return {
      sourceName,
      suggestedCategories: ['QUAD'],
      confidence: 'high',
      reason: 'Name signals quadruple occupancy.',
    };
  }
  if (/\btwin\b/i.test(normalized)) {
    return {
      sourceName,
      suggestedCategories: ['TWIN', 'DBL'],
      confidence: 'high',
      reason: 'Name signals twin — usually mapped to TWIN or DBL depending on contract convention.',
    };
  }
  if (/\bdouble\b|\bdbl\b|\b2\s*pax\b|\bking\b|\bqueen\b/i.test(normalized)) {
    return {
      sourceName,
      suggestedCategories: ['DBL', 'TWIN'],
      confidence: 'medium',
      reason: 'Name signals double occupancy.',
    };
  }

  // Generic descriptor with no occupancy keyword → most common occupancy bucket.
  if (/\bclassic\b|\bstandard\b|\bdeluxe\b|\bsuperior\b|\bview\b/i.test(normalized)) {
    return {
      sourceName,
      suggestedCategories: ['DBL', 'TWIN'],
      confidence: 'low',
      reason: 'Generic descriptor — defaulting to most common occupancy (DBL/TWIN). Operator should confirm.',
    };
  }

  return {
    sourceName,
    suggestedCategories: ['DBL'],
    confidence: 'low',
    reason: 'No matching keywords — defaulting to DBL. Operator must verify.',
  };
}

// ---------------------------------------------------------------------------
// Supplement Validation — detect duplicate / conflicting / malformed
// supplement rows. Returns findings sorted by severity.
// ---------------------------------------------------------------------------

export type SupplementFinding = {
  kind:
    | 'DUPLICATE_TYPE_SAME_ROOM'
    | 'HB_INCLUDED_AND_HB_SUPPLEMENT'
    | 'MISSING_PRICING_BASIS'
    | 'INCONSISTENT_SCOPE'
    | 'MISSING_AMOUNT';
  severity: 'high' | 'medium' | 'low';
  message: string;
  supplementIds: string[];
};

export function validateSupplements(
  supplements: SupplementInput[],
  context: { rateMealPlans?: string[] } = {},
): SupplementFinding[] {
  const findings: SupplementFinding[] = [];
  const active = supplements.filter((s) => s.isActive !== false);

  // 1. Duplicate supplement type within the same room scope.
  const byKey = new Map<string, SupplementInput[]>();
  for (const supplement of active) {
    const key = `${supplement.type}::${supplement.roomCategoryId ?? '__all__'}`;
    const bucket = byKey.get(key) || [];
    bucket.push(supplement);
    byKey.set(key, bucket);
  }
  for (const [, bucket] of byKey) {
    if (bucket.length > 1) {
      findings.push({
        kind: 'DUPLICATE_TYPE_SAME_ROOM',
        severity: 'high',
        message: `Found ${bucket.length} active "${bucket[0].type}" supplements for the same room scope — operator should consolidate or rename.`,
        supplementIds: bucket.map((b) => b.id),
      });
    }
  }

  // 2. HB-as-meal-plan AND HB supplement combo — common import error
  // where the contract already includes HB on the rate row and then a
  // duplicate supplement adds HB cost on top. Detected when the
  // rate-meal-plan context includes HB AND there's an EXTRA_DINNER
  // supplement (the spec's HB-equivalent).
  const hasHbRate = (context.rateMealPlans || []).includes('HB');
  const extraDinnerSupplements = active.filter((s) => s.type === 'EXTRA_DINNER');
  if (hasHbRate && extraDinnerSupplements.length > 0) {
    findings.push({
      kind: 'HB_INCLUDED_AND_HB_SUPPLEMENT',
      severity: 'high',
      message:
        'Contract has HB rates and an EXTRA_DINNER supplement. This often double-charges dinner — confirm whether dinner is included in the HB rate or added via supplement.',
      supplementIds: extraDinnerSupplements.map((s) => s.id),
    });
  }

  // 3. Missing pricing basis — supplement row exists but chargeBasis is
  // null/blank. Pricing engine will fall back to PER_NIGHT which may
  // not be what the contract intends.
  for (const supplement of active) {
    if (!supplement.chargeBasis || String(supplement.chargeBasis).trim() === '') {
      findings.push({
        kind: 'MISSING_PRICING_BASIS',
        severity: 'medium',
        message: `Supplement "${supplement.type}" has no chargeBasis — operator must set PER_PERSON / PER_ROOM / PER_NIGHT / PER_STAY explicitly.`,
        supplementIds: [supplement.id],
      });
    }
  }

  // 4. Missing amount — explicit null/undefined OR non-numeric string.
  // amount === 0 is treated as suspicious (free supplements are real but
  // rare; the operator should confirm it isn't an import miss).
  for (const supplement of active) {
    if (supplement.amount === null || supplement.amount === undefined) {
      findings.push({
        kind: 'MISSING_AMOUNT',
        severity: 'high',
        message: `Supplement "${supplement.type}" has no amount value — operator must enter the supplement cost or mark it as not applicable.`,
        supplementIds: [supplement.id],
      });
      continue;
    }
    const parsed = Number(supplement.amount);
    if (!Number.isFinite(parsed) || parsed < 0) {
      findings.push({
        kind: 'MISSING_AMOUNT',
        severity: 'high',
        message: `Supplement "${supplement.type}" has an invalid amount (${supplement.amount}).`,
        supplementIds: [supplement.id],
      });
    }
  }

  // 5. Inconsistent scope — same supplement type appears once room-scoped
  // and once contract-wide. Usually an import dedupe miss.
  const byType = new Map<string, { scoped: SupplementInput[]; global: SupplementInput[] }>();
  for (const supplement of active) {
    const bucket = byType.get(supplement.type) || { scoped: [], global: [] };
    if (supplement.roomCategoryId) bucket.scoped.push(supplement);
    else bucket.global.push(supplement);
    byType.set(supplement.type, bucket);
  }
  for (const [type, { scoped, global }] of byType) {
    if (scoped.length > 0 && global.length > 0) {
      findings.push({
        kind: 'INCONSISTENT_SCOPE',
        severity: 'medium',
        message: `Supplement "${type}" has both contract-wide and room-scoped entries. Pricing engine resolution may be ambiguous — pick one scope.`,
        supplementIds: [...scoped, ...global].map((s) => s.id),
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Season Validation — detect overlapping seasons, gaps within contract
// validity, duplicate season names with mismatched ranges, and invalid
// validity ranges.
// ---------------------------------------------------------------------------

export type SeasonFinding = {
  kind:
    | 'OVERLAPPING_SEASONS'
    | 'GAP_IN_VALIDITY'
    | 'DUPLICATE_NAME_DIFFERENT_RANGE'
    | 'INVALID_RANGE';
  severity: 'high' | 'medium' | 'low';
  message: string;
  seasonIds: string[];
};

export function validateSeasons(
  seasons: SeasonInput[],
  contractValidity?: { validFrom: Date | string; validTo: Date | string },
): SeasonFinding[] {
  const findings: SeasonFinding[] = [];
  const parsed = seasons
    .map((season) => ({
      id: season.id,
      name: season.name,
      from: new Date(season.validFrom),
      to: new Date(season.validTo),
    }))
    .filter((season) => !Number.isNaN(season.from.getTime()) && !Number.isNaN(season.to.getTime()));

  // 1. Invalid range — validFrom > validTo.
  for (const season of parsed) {
    if (season.from > season.to) {
      findings.push({
        kind: 'INVALID_RANGE',
        severity: 'high',
        message: `Season "${season.name}" has validFrom after validTo.`,
        seasonIds: [season.id],
      });
    }
  }

  // 2. Overlapping seasons — sorted scan O(n log n).
  const sorted = [...parsed].filter((s) => s.from <= s.to).sort((a, b) => a.from.getTime() - b.from.getTime());
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (next.from <= current.to) {
      findings.push({
        kind: 'OVERLAPPING_SEASONS',
        severity: 'high',
        message: `Seasons "${current.name}" and "${next.name}" overlap. Rate lookups in the overlap window can resolve to either season — fix the boundaries.`,
        seasonIds: [current.id, next.id],
      });
    }
  }

  // 3. Gaps within contract validity. Walk sorted seasons; if there's
  //    > 1-day gap between consecutive coverage AND the contract is
  //    supposed to be continuous, flag it.
  if (contractValidity && sorted.length > 1) {
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      const gapDays = Math.floor((next.from.getTime() - current.to.getTime()) / 86400000);
      if (gapDays > 1) {
        findings.push({
          kind: 'GAP_IN_VALIDITY',
          severity: 'medium',
          message: `Gap of ${gapDays} days between seasons "${current.name}" and "${next.name}". Rate lookups in that window will fail.`,
          seasonIds: [current.id, next.id],
        });
      }
    }
  }

  // 4. Duplicate season names with different ranges. Usually means the
  //    PDF carried two "Summer" rows that the importer didn't merge.
  const byName = new Map<string, typeof parsed>();
  for (const season of parsed) {
    const bucket = byName.get(season.name) || [];
    bucket.push(season);
    byName.set(season.name, bucket);
  }
  for (const [name, bucket] of byName) {
    if (bucket.length > 1) {
      const sameRange = bucket.every(
        (s) => s.from.getTime() === bucket[0].from.getTime() && s.to.getTime() === bucket[0].to.getTime(),
      );
      if (!sameRange) {
        findings.push({
          kind: 'DUPLICATE_NAME_DIFFERENT_RANGE',
          severity: 'medium',
          message: `Multiple seasons named "${name}" with different date ranges. Merge or rename to disambiguate.`,
          seasonIds: bucket.map((s) => s.id),
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Pricing Interpretation Preview — show the operator exactly how the
// ERP will read each rate row before they commit. Pure formatter; no
// pricing math.
// ---------------------------------------------------------------------------

export type RateInterpretation = {
  rateId: string;
  roomCategoryId: string;
  reads: {
    occupancy: string;
    mealPlan: string;
    season: string;
    seasonRange: string;
    cost: string;
    pricingBasis: string;
  };
  warnings: string[];
};

export function interpretRates(rates: RateInput[]): RateInterpretation[] {
  return rates.map((rate) => {
    const warnings: string[] = [];
    if (!rate.pricingBasis) warnings.push('No pricingBasis set — engine will fall back to PER_ROOM.');
    if (!rate.seasonName) warnings.push('Season name missing — will display as "Open season".');
    if (!Number.isFinite(rate.cost) || rate.cost <= 0) warnings.push('Cost is zero or invalid.');
    return {
      rateId: rate.id,
      roomCategoryId: rate.roomCategoryId,
      reads: {
        occupancy: String(rate.occupancyType),
        mealPlan: String(rate.mealPlan),
        season: String(rate.seasonName || 'Open season'),
        seasonRange:
          rate.seasonFrom && rate.seasonTo
            ? `${formatYmd(rate.seasonFrom)} → ${formatYmd(rate.seasonTo)}`
            : 'Whole contract validity',
        cost: `${Number(rate.cost || 0).toFixed(2)} ${rate.currency || 'USD'}`,
        pricingBasis: rate.pricingBasis ? String(rate.pricingBasis) : 'PER_ROOM (default)',
      },
      warnings,
    };
  });
}

function formatYmd(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Re-upload + Diff — given the current contract data and a candidate
// new payload, return what changed / was added / was removed so the
// operator can review BEFORE confirming overwrite.
// ---------------------------------------------------------------------------

export type DiffEntry<T> = {
  status: 'added' | 'removed' | 'changed' | 'unchanged';
  before?: T;
  after?: T;
  changedFields?: string[];
};

export type ContractDiff = {
  roomCategories: DiffEntry<RoomCategoryInput>[];
  rates: DiffEntry<RateInput>[];
  supplements: DiffEntry<SupplementInput>[];
  seasons: DiffEntry<SeasonInput>[];
  summary: {
    addedCount: number;
    removedCount: number;
    changedCount: number;
    suspicious: string[];
  };
};

export type ContractSnapshot = {
  roomCategories: RoomCategoryInput[];
  rates: RateInput[];
  supplements: SupplementInput[];
  seasons: SeasonInput[];
};

export function diffContractSnapshots(before: ContractSnapshot, after: ContractSnapshot): ContractDiff {
  const roomCategories = diffById(before.roomCategories, after.roomCategories, ['name', 'code', 'isActive']);
  const rates = diffByKey(
    before.rates,
    after.rates,
    (rate) => `${rate.roomCategoryId}::${rate.occupancyType}::${rate.mealPlan}::${rate.seasonName}`,
    ['cost', 'pricingBasis', 'currency'],
  );
  const supplements = diffByKey(
    before.supplements,
    after.supplements,
    (supplement) => `${supplement.type}::${supplement.roomCategoryId ?? '__all__'}`,
    ['amount', 'chargeBasis', 'isMandatory', 'isActive'],
  );
  const seasons = diffByKey(
    before.seasons,
    after.seasons,
    (season) => season.name,
    ['validFrom', 'validTo'],
  );

  const allEntries = [...roomCategories, ...rates, ...supplements, ...seasons];
  const addedCount = allEntries.filter((entry) => entry.status === 'added').length;
  const removedCount = allEntries.filter((entry) => entry.status === 'removed').length;
  const changedCount = allEntries.filter((entry) => entry.status === 'changed').length;

  // Suspicious flags: big price moves, removed rooms with active rates, etc.
  const suspicious: string[] = [];
  for (const entry of rates) {
    if (entry.status === 'changed' && entry.before && entry.after) {
      const ratio = Number(entry.after.cost) / Math.max(Number(entry.before.cost), 0.01);
      if (ratio > 1.5 || ratio < 0.5) {
        suspicious.push(`Rate ${entry.after.id || ''} moved by ${(Math.abs(ratio - 1) * 100).toFixed(0)}% — verify before overwrite.`);
      }
    }
  }
  const removedRooms = roomCategories.filter((entry) => entry.status === 'removed');
  if (removedRooms.length > 0) {
    suspicious.push(`${removedRooms.length} room category(ies) would be removed — historical quote items reference these IDs. Use soft-deactivate instead.`);
  }

  return {
    roomCategories,
    rates,
    supplements,
    seasons,
    summary: { addedCount, removedCount, changedCount, suspicious },
  };
}

function diffById<T extends { id: string }>(before: T[], after: T[], fields: (keyof T)[]): DiffEntry<T>[] {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterById = new Map(after.map((item) => [item.id, item]));
  const entries: DiffEntry<T>[] = [];
  for (const [id, beforeItem] of beforeById) {
    const afterItem = afterById.get(id);
    if (!afterItem) {
      entries.push({ status: 'removed', before: beforeItem });
    } else {
      const changed = fields.filter((field) => beforeItem[field] !== afterItem[field]);
      entries.push({
        status: changed.length > 0 ? 'changed' : 'unchanged',
        before: beforeItem,
        after: afterItem,
        changedFields: changed.map(String),
      });
    }
  }
  for (const [id, afterItem] of afterById) {
    if (!beforeById.has(id)) {
      entries.push({ status: 'added', after: afterItem });
    }
  }
  return entries;
}

function diffByKey<T>(before: T[], after: T[], keyFn: (item: T) => string, fields: (keyof T)[]): DiffEntry<T>[] {
  const beforeByKey = new Map(before.map((item) => [keyFn(item), item]));
  const afterByKey = new Map(after.map((item) => [keyFn(item), item]));
  const entries: DiffEntry<T>[] = [];
  for (const [key, beforeItem] of beforeByKey) {
    const afterItem = afterByKey.get(key);
    if (!afterItem) {
      entries.push({ status: 'removed', before: beforeItem });
    } else {
      const changed = fields.filter((field) => String(beforeItem[field]) !== String(afterItem[field]));
      entries.push({
        status: changed.length > 0 ? 'changed' : 'unchanged',
        before: beforeItem,
        after: afterItem,
        changedFields: changed.map(String),
      });
    }
  }
  for (const [key, afterItem] of afterByKey) {
    if (!beforeByKey.has(key)) {
      entries.push({ status: 'added', after: afterItem });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Confidence Derivation — given the validator findings, recommend a
// confidence status. Operator can override; this is just a suggestion.
// ---------------------------------------------------------------------------

export type ConfidenceStatus =
  | 'IMPORTED_UNVERIFIED'
  | 'NEEDS_REVIEW'
  | 'PRICING_INCOMPLETE'
  | 'SUPPLEMENT_REVIEW_REQUIRED'
  | 'SEASON_CONFLICT'
  | 'VERIFIED';

export function recommendConfidence(input: {
  currentStatus: ConfidenceStatus;
  supplementFindings: SupplementFinding[];
  seasonFindings: SeasonFinding[];
  pricingComplete: boolean;
}): { recommended: ConfidenceStatus; reason: string } {
  // VERIFIED is operator-only. Never auto-promote.
  if (input.currentStatus === 'VERIFIED') {
    return { recommended: 'VERIFIED', reason: 'Already operator-verified.' };
  }

  // Most-specific blocker wins.
  if (input.seasonFindings.some((f) => f.severity === 'high')) {
    return { recommended: 'SEASON_CONFLICT', reason: 'High-severity season overlap or invalid range detected.' };
  }
  if (input.supplementFindings.some((f) => f.severity === 'high')) {
    return {
      recommended: 'SUPPLEMENT_REVIEW_REQUIRED',
      reason: 'High-severity supplement conflict detected (duplicate / HB-included combo / missing amount).',
    };
  }
  if (!input.pricingComplete) {
    return { recommended: 'PRICING_INCOMPLETE', reason: 'Some occupancy / meal-plan combinations have no rate rows.' };
  }
  if (input.supplementFindings.length > 0 || input.seasonFindings.length > 0) {
    return { recommended: 'NEEDS_REVIEW', reason: 'Minor findings — operator review recommended.' };
  }
  // No findings but operator hasn't promoted yet.
  return { recommended: 'IMPORTED_UNVERIFIED', reason: 'No automated findings — pending operator verification.' };
}

// ---------------------------------------------------------------------------
// Pricing completeness — given the rate matrix, return whether every
// (room x occupancy x meal-plan) combo present in the contract has at
// least one rate. Detects PRICING_INCOMPLETE state.
// ---------------------------------------------------------------------------

export function isPricingComplete(
  roomCategoryIds: string[],
  rates: RateInput[],
  options: { expectedMealPlans?: string[]; expectedOccupancies?: string[] } = {},
): { complete: boolean; missing: Array<{ roomCategoryId: string; occupancy: string; mealPlan: string }> } {
  if (roomCategoryIds.length === 0 || rates.length === 0) {
    return { complete: false, missing: [] };
  }
  const presentMealPlans = options.expectedMealPlans || Array.from(new Set(rates.map((r) => r.mealPlan)));
  const presentOccupancies = options.expectedOccupancies || Array.from(new Set(rates.map((r) => r.occupancyType)));
  const rateKeys = new Set(rates.map((r) => `${r.roomCategoryId}::${r.occupancyType}::${r.mealPlan}`));
  const missing: Array<{ roomCategoryId: string; occupancy: string; mealPlan: string }> = [];
  for (const roomCategoryId of roomCategoryIds) {
    for (const occupancy of presentOccupancies) {
      for (const mealPlan of presentMealPlans) {
        const key = `${roomCategoryId}::${occupancy}::${mealPlan}`;
        if (!rateKeys.has(key)) {
          missing.push({ roomCategoryId, occupancy, mealPlan });
        }
      }
    }
  }
  return { complete: missing.length === 0, missing };
}
