// Quote Builder V2 — Phase B, Slice 2 item-create feature flag. Default OFF.
//
// `quote.itemCreate` gates the NEW V2-scoped item-create route
// (POST /quotes/:quoteId/v2/experiences/item). Slice 2 supports ACTIVITY items
// ONLY. The route reuses the EXISTING QuotesService.createItem (the same pricing +
// recalculation path Classic uses) — it never forks pricing. When OFF (the default),
// the route returns a safe feature_disabled response and writes nothing.
//
// This flag ONLY gates the V2-scoped route. The existing shared Classic item-create
// endpoint (POST /quotes/:id/items) is intentionally NOT gated and keeps working
// exactly as before — Classic behavior is unchanged.

function readBooleanEnv(name: string): boolean {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

export const QUOTE_ITEM_CREATE_FLAG = 'quote.itemCreate';

// OFF unless QUOTE_ITEM_CREATE is explicitly truthy.
export function isQuoteItemCreateEnabled(): boolean {
  return readBooleanEnv('QUOTE_ITEM_CREATE');
}
