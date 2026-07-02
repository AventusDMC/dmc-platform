// Quote Builder V2 — Phase B, Slice 1 itinerary-edit feature flag. Default OFF.
//
// `quote.itineraryEdit` gates the NEW V2-scoped itinerary-day management routes
// (POST/PATCH/DELETE /quotes/:quoteId/v2/itinerary/day[...]) — add day, edit day
// meta (title/notes), and delete an EMPTY day. These are pricing-INERT structural
// edits: they never call recalculateQuoteTotals and never touch item pricing.
//
// This flag ONLY gates the V2-scoped routes. The existing shared Classic itinerary
// endpoints (POST /quotes/:quoteId/itinerary/day, PATCH/DELETE /itinerary/day/:dayId)
// are intentionally NOT gated by this flag and keep working exactly as before —
// Classic behavior is unchanged. When this flag is OFF (the default), the V2 routes
// reject with a safe feature_disabled response and write nothing.

function readBooleanEnv(name: string): boolean {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

export const QUOTE_ITINERARY_EDIT_FLAG = 'quote.itineraryEdit';

// OFF unless QUOTE_ITINERARY_EDIT is explicitly truthy.
export function isQuoteItineraryEditEnabled(): boolean {
  return readBooleanEnv('QUOTE_ITINERARY_EDIT');
}
