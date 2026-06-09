// Shared pricing constants.
//
// HOTEL_DEFAULT_MARKUP — the standard markup percentage applied to hotel items
// (HOTEL = 15%). The hotel price PREVIEW (Phase R.6A-0) and a future hotel APPLY
// (R.6A-1) use this single source of truth rather than relying on createItem's
// 0% fallback or scattered magic numbers.
export const HOTEL_DEFAULT_MARKUP = 15;

// EXPERIENCE_DEFAULT_MARKUP — the standard non-hotel markup percentage applied to
// entrance / ticket / activity items (20%, matching transport and the auto-builder).
// The Phase R.6C-0 read-only experience price PREVIEW (and a future experience
// APPLY, R.6C-1) use this single source of truth rather than scattered literals.
export const EXPERIENCE_DEFAULT_MARKUP = 20;

// GUIDE_DEFAULT_MARKUP — the standard markup percentage applied to guide items
// (20%, matching transport / experiences). GUIDE_LOCAL_FULL_DAY_COST mirrors the
// authoritative GUIDE_RATES.local.full_day rate in quotes.service.ts. The Phase
// R.6D-0 read-only guide price PREVIEW (and a future guide APPLY, R.6D-1) use
// these as the single source of truth for the estimate; createItem's GUIDE_RATES
// path stays authoritative on apply. Local full day: 120 cost → 144 sell.
export const GUIDE_DEFAULT_MARKUP = 20;
export const GUIDE_LOCAL_FULL_DAY_COST = 120;
