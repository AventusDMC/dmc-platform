// H-A1: pure, read-only matcher that resolves a QuoteHotelOption (a Hotels-step
// row) to its priced hotel QuoteItem WITHIN THE SAME OPTION SET, and returns safe
// computed metadata for Quote Builder V2 to consume later (Slice H-A).
//
// WHY THIS LIVES ON THE BACKEND: QuoteHotelOption has no quoteItemId FK and does
// NOT carry occupancyType / seasonName / serviceDate, so the frontend cannot match
// deterministically. The priced QuoteItem DOES carry those fields, so the match is
// computed here where the data lives. This module is pure (no Prisma, no I/O), does
// NOT read cost/margin/rate/contract detail, and NEVER guesses — genuinely
// undecidable rows return `ambiguous`/`none` so the UI keeps the Classic fallback.
//
// It changes NO pricing math, NO resolver, NO apply behavior — it only produces
// additive, safe metadata for the quote GET payload.

export type HotelOptionPricingMatchStatus = 'matched' | 'ambiguous' | 'none';

export type HotelOptionPricingMatchReason =
  | 'direct_option_item_match'
  | 'narrowed_by_room_meal_occupancy_season_date'
  | 'ambiguous_duplicate_candidates'
  | 'no_priced_item_for_option'
  | 'no_contract_linked'
  | 'missing_discriminator';

/** Safe, non-cost / non-PII summary of what identified the matched priced item. */
export interface HotelOptionMatchedDiscriminators {
  roomCategoryId?: string | null;
  mealPlan?: string | null;
  mealPlanCode?: string | null;
  occupancyType?: string | null;
  seasonName?: string | null;
  serviceDate?: string | null;
  optionId?: string | null;
}

export interface HotelOptionPricingMatch {
  matchedPricedQuoteItemId: string | null;
  pricingMatchStatus: HotelOptionPricingMatchStatus;
  pricingMatchReason: HotelOptionPricingMatchReason;
  matchedDiscriminators?: HotelOptionMatchedDiscriminators;
}

/** The QuoteHotelOption row fields used for matching (structural subset). */
export interface HotelOptionRowInput {
  hotelId?: string | null;
  roomCategoryId?: string | null;
  hotelNameSnapshot?: string | null;
  mealPlan?: string | null;
  mealPlanCode?: string | null;
}

/** A priced hotel QuoteItem candidate (structural subset — no cost fields read). */
export interface PricedHotelItemInput {
  id: string;
  optionId?: string | null;
  hotelId?: string | null;
  contractId?: string | null;
  roomCategoryId?: string | null;
  mealPlan?: string | null; // HotelMealPlan enum value (serialized as string)
  occupancyType?: string | null; // HotelOccupancyType enum value
  seasonName?: string | null;
  serviceDate?: string | Date | null;
  hotel?: { name?: string | null } | null;
}

const norm = (value?: string | null): string => (value || '').trim().toLowerCase();

/** Canonical, comparable key for a date (day granularity) — safe, non-cost. */
function dateKey(value?: string | Date | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s) return null;
  // Full ISO timestamps → day; plain YYYY-MM-DD passes through unchanged.
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function none(reason: HotelOptionPricingMatchReason): HotelOptionPricingMatch {
  return { matchedPricedQuoteItemId: null, pricingMatchStatus: 'none', pricingMatchReason: reason };
}

function ambiguous(reason: HotelOptionPricingMatchReason): HotelOptionPricingMatch {
  return { matchedPricedQuoteItemId: null, pricingMatchStatus: 'ambiguous', pricingMatchReason: reason };
}

/** Resolve a single candidate to a result — but keep the Classic fallback when the
 *  candidate has no linked contract (an on-request line cannot be priced/applied). */
function finalizeSingle(
  item: PricedHotelItemInput,
  reason: HotelOptionPricingMatchReason,
): HotelOptionPricingMatch {
  if (item.contractId == null) {
    return { matchedPricedQuoteItemId: null, pricingMatchStatus: 'none', pricingMatchReason: 'no_contract_linked' };
  }
  return {
    matchedPricedQuoteItemId: item.id,
    pricingMatchStatus: 'matched',
    pricingMatchReason: reason,
    matchedDiscriminators: {
      roomCategoryId: item.roomCategoryId ?? null,
      mealPlan: item.mealPlan != null ? String(item.mealPlan) : null,
      mealPlanCode: item.mealPlan ?? null,
      occupancyType: item.occupancyType ?? null,
      seasonName: item.seasonName ?? null,
      serviceDate: dateKey(item.serviceDate),
      optionId: item.optionId ?? null,
    },
  };
}

/**
 * Compute the read-only match metadata for one QuoteHotelOption against the priced
 * hotel QuoteItems that belong to the SAME option set (the caller must pass only
 * that pool — i.e. `option.quoteItems`).
 *
 * Never guesses: if the row cannot be resolved to exactly one candidate on the
 * fields available on BOTH sides, returns ambiguous/none so the UI keeps Classic.
 */
export function computeHotelOptionPricedMatch(
  row: HotelOptionRowInput,
  optionItems: PricedHotelItemInput[],
): HotelOptionPricingMatch {
  // 3. Hotel items only (a priced hotel line always carries hotelId).
  const hotelItems = (optionItems || []).filter((it) => it && it.id && it.hotelId != null);
  if (hotelItems.length === 0) return none('no_priced_item_for_option');

  // 4-5. Base set: prefer exact hotelId; name fallback ONLY when the row has no
  // hotelId. A row hotelId that matches no candidate does NOT fall back to name.
  let base: PricedHotelItemInput[];
  if (row.hotelId) {
    base = hotelItems.filter((it) => it.hotelId === row.hotelId);
    if (base.length === 0) return none('no_priced_item_for_option');
  } else {
    const nm = norm(row.hotelNameSnapshot);
    if (!nm) return ambiguous('missing_discriminator');
    base = hotelItems.filter((it) => norm(it.hotel?.name) === nm);
    if (base.length === 0) return none('no_priced_item_for_option');
  }

  if (base.length === 1) return finalizeSingle(base[0], 'direct_option_item_match');

  // 6. Narrow ONLY by fields the row can actually supply and compare safely:
  // roomCategoryId, then mealPlan code. occupancyType / seasonName / serviceDate
  // do NOT exist on the row, so they can never be used to choose — only to detect
  // that candidates differ (→ missing_discriminator below).
  let cur = base;
  let narrowed = false;

  if (row.roomCategoryId) {
    const f = cur.filter((it) => it.roomCategoryId && it.roomCategoryId === row.roomCategoryId);
    if (f.length === 1) return finalizeSingle(f[0], 'narrowed_by_room_meal_occupancy_season_date');
    if (f.length > 1) { cur = f; narrowed = true; }
    // f.length === 0 → the row's roomCategory matches no candidate; cannot use it to
    // choose, so leave `cur` unchanged and try the next discriminator.
  }

  if (row.mealPlanCode) {
    const wanted = norm(row.mealPlanCode);
    const f = cur.filter((it) => it.mealPlan && norm(it.mealPlan) === wanted);
    if (f.length === 1) return finalizeSingle(f[0], 'narrowed_by_room_meal_occupancy_season_date');
    if (f.length > 1) { cur = f; narrowed = true; }
  }

  if (cur.length === 1) {
    return finalizeSingle(cur[0], narrowed ? 'narrowed_by_room_meal_occupancy_season_date' : 'direct_option_item_match');
  }

  // 8. Still multiple. If the remaining candidates are indistinguishable on EVERY
  // safe discriminator → genuine duplicates. If they differ on a field the row
  // cannot supply (occupancy / season / serviceDate) → missing_discriminator.
  const discriminatorKey = (it: PricedHotelItemInput): string =>
    [it.roomCategoryId, it.mealPlan, it.occupancyType, it.seasonName, dateKey(it.serviceDate)]
      .map((v) => (v == null ? '∅' : String(v)))
      .join('|');
  const distinct = new Set(cur.map(discriminatorKey));
  return distinct.size === 1 ? ambiguous('ambiguous_duplicate_candidates') : ambiguous('missing_discriminator');
}
