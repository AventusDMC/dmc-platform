// Quote pricing-preview feature flag (dry-run preview, PR2). Default OFF.
//
// `quote.pricingPreview` gates the read-only dry-run pricing PREVIEW endpoint
// (POST /quotes/:id/items/:itemId/preview). When OFF (the default), the endpoint
// returns a blocked/not-available response and performs no compute. The preview
// never persists anything and never calls recalculateQuoteTotals — the flag only
// controls whether the endpoint is exposed at all.

export const QUOTE_PRICING_PREVIEW_FLAG = 'quote.pricingPreview';

function readBooleanEnv(name: string): boolean {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

// OFF unless QUOTE_PRICING_PREVIEW is explicitly truthy.
export function isQuotePricingPreviewEnabled(): boolean {
  return readBooleanEnv('QUOTE_PRICING_PREVIEW');
}

// `quote.pricingApply` gates the dry-run preview APPLY guard (PR4):
// POST /quotes/:id/items/:itemId/apply-preview. STRICTER than preview — apply
// writes (re-uses updateItem). It requires BOTH this flag AND the preview flag
// to be ON; either OFF → the apply endpoint is unavailable and writes nothing.
// Default OFF.
export const QUOTE_PRICING_APPLY_FLAG = 'quote.pricingApply';

export function isQuotePricingApplyEnabled(): boolean {
  return readBooleanEnv('QUOTE_PRICING_APPLY');
}

// ── Entrance / Jordan Pass pricing scope (separate, default OFF) ─────────────
//
// Entrance/Jordan-Pass items are a NEW scope on top of the meal/activity/guide
// preview-apply. Because the global QUOTE_PRICING_PREVIEW / QUOTE_PRICING_APPLY
// flags are already ON in production, this scope MUST gate on its OWN flags so
// merging the feature does not expose it automatically. Both default OFF.
//
// `quote.pricingEntrancePreview` gates the entrance branch of the preview
// (Jordan-Pass-aware re-projection). When OFF, an entrance item preview is
// blocked as out-of-scope and no token is issued.
export const QUOTE_PRICING_ENTRANCE_PREVIEW_FLAG = 'quote.pricingEntrancePreview';

export function isQuotePricingEntrancePreviewEnabled(): boolean {
  return readBooleanEnv('QUOTE_PRICING_ENTRANCE_PREVIEW');
}

// `quote.pricingEntranceApply` gates APPLY for entrance/Jordan-Pass items. Like
// the global apply, it is STRICTER than preview: an entrance apply requires the
// global preview+apply flags AND the entrance preview flag AND this flag — any
// one OFF → entrance apply is rejected as out-of-scope and nothing is written.
// Default OFF.
export const QUOTE_PRICING_ENTRANCE_APPLY_FLAG = 'quote.pricingEntranceApply';

export function isQuotePricingEntranceApplyEnabled(): boolean {
  return readBooleanEnv('QUOTE_PRICING_ENTRANCE_APPLY');
}

// ── Transport pricing PREVIEW scope (separate, default OFF) ──────────────────
//
// Transport items (route transfer / airport transfer / point-to-point / full-day
// / package / touring-route) are a NEW preview scope. The dry-run preview path is
// already pure (resolveQuoteItemValues → transportPricingService.resolvePricingRule
// /findMatchingRate are read-only; computeItemPreview never writes or recalculates),
// but because the global QUOTE_PRICING_PREVIEW flag is already ON in production,
// transport preview MUST gate on its OWN flag so it is not exposed automatically.
// When OFF (the default), a transport item preview is blocked as out-of-scope and
// no value is computed and no token is issued. There is intentionally NO transport
// APPLY flag — transport stays preview-only and the apply guard independently
// rejects transport items as out of scope.
export const QUOTE_PRICING_TRANSPORT_PREVIEW_FLAG = 'quote.pricingTransportPreview';

export function isQuotePricingTransportPreviewEnabled(): boolean {
  return readBooleanEnv('QUOTE_PRICING_TRANSPORT_PREVIEW');
}

// ── Hotel pricing PREVIEW scope (separate, default OFF) ──────────────────────
//
// Hotel items (contracted / on-request / fallback) are a NEW preview scope. The
// dry-run preview path is already pure (resolveQuoteItemValues' hotel branch does
// hotelRate.findMany reads + compute; computeItemPreview never writes or
// recalculates), but because the global QUOTE_PRICING_PREVIEW flag is already ON
// in production, hotel preview MUST gate on its OWN flag so it is not exposed
// automatically. When OFF (the default), a hotel item preview is blocked as
// out-of-scope and nothing is computed and no token is issued.
export const QUOTE_PRICING_HOTEL_PREVIEW_FLAG = 'quote.pricingHotelPreview';

export function isQuotePricingHotelPreviewEnabled(): boolean {
  return readBooleanEnv('QUOTE_PRICING_HOTEL_PREVIEW');
}

// Hotel pricing APPLY scope (separate, default OFF). STRICTER than preview —
// apply writes via the EXISTING updateItem → recalculateQuoteTotals path (the
// same write Classic uses), so it requires BOTH the hotel preview flag (to
// compute + issue the token) AND this apply flag. When OFF (the default), the
// apply guard rejects hotel items as out of scope, so hotel stays preview-only.
// No schema/formula change — apply just re-persists the freshly-resolved hotel
// price for the already-selected hotel/contract/room/occupancy/dates.
export const QUOTE_PRICING_HOTEL_APPLY_FLAG = 'quote.pricingHotelApply';

export function isQuotePricingHotelApplyEnabled(): boolean {
  return readBooleanEnv('QUOTE_PRICING_HOTEL_APPLY');
}

// ── External-package pricing PREVIEW scope (separate, default OFF) ────────────
//
// External (multi-country / partner) package items are a NEW preview scope. The
// dry-run preview path is already pure (resolveQuoteItemValues' external-package
// branch normalizes the persisted net cost / pricing matrix + compute; no writes;
// computeItemPreview never recalculates). Because the global QUOTE_PRICING_PREVIEW
// flag is already ON in production, external-package preview MUST gate on its OWN
// flag so it is not exposed automatically. When OFF (the default), an external
// package preview is blocked as out-of-scope (no compute, no token). Apply is a
// SEPARATE, stricter scope behind its own flag below — external package stays
// preview-only unless BOTH the preview and the apply flag are ON.
export const QUOTE_PRICING_EXTERNAL_PACKAGE_PREVIEW_FLAG = 'quote.pricingExternalPackagePreview';

export function isQuotePricingExternalPackagePreviewEnabled(): boolean {
  return readBooleanEnv('QUOTE_PRICING_EXTERNAL_PACKAGE_PREVIEW');
}

// External-package pricing APPLY scope (separate, default OFF). STRICTER than
// preview — apply writes via the EXISTING updateItem → recalculateQuoteTotals path
// (the same write Classic uses), so it requires BOTH the external-package preview
// flag (to compute + issue the token) AND this apply flag. When OFF (the default),
// the apply guard rejects external-package items as out of scope, so external
// package stays preview-only. No schema/formula change — apply just re-persists the
// freshly-resolved price for the already-entered external package (net cost / rate
// matrix / basis / pax) in place; itinerary text and bundled/included content are
// preserved by patch semantics and no other item is touched.
export const QUOTE_PRICING_EXTERNAL_PACKAGE_APPLY_FLAG = 'quote.pricingExternalPackageApply';

export function isQuotePricingExternalPackageApplyEnabled(): boolean {
  return readBooleanEnv('QUOTE_PRICING_EXTERNAL_PACKAGE_APPLY');
}
