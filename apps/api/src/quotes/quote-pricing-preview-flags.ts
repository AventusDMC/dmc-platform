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
