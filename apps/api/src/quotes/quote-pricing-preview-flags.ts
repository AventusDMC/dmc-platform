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
