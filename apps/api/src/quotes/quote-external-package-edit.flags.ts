// ERP V2 — E-a: guarded external-package COMMERCIAL EDIT feature flag. Default OFF.
//
// `QUOTE_EXTERNAL_PACKAGE_EDIT` gates the NEW, V2-scoped, edit-preview + edit-apply
// routes (POST /quotes/:quoteId/v2/experiences/item/:itemId/edit[/preview]). It is a
// DEDICATED flag — deliberately separate from QUOTE_ITEM_CREATE (create/delete) and
// from every pricing-apply flag — so this in-place commercial edit can never be turned
// on as a side effect of enabling another surface, and cannot be reached until it is
// explicitly enabled. When OFF (the default, and its state in EVERY environment for
// this slice), both the preview and the apply return a safe feature_disabled response
// and write nothing.
//
// The edit reuses the EXISTING, UNCHANGED QuotesService.previewUpdateQuoteItem (pure
// projection) + QuotesService.updateItem (write + recalc) — it never forks pricing and
// never touches the production pricing-apply path. This flag ONLY gates the V2 edit
// routes; the shared Classic item-update endpoint is intentionally NOT gated and keeps
// working exactly as before.

function readBooleanEnv(name: string): boolean {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

export const QUOTE_EXTERNAL_PACKAGE_EDIT_FLAG = 'quote.externalPackageEdit';

// OFF unless QUOTE_EXTERNAL_PACKAGE_EDIT is explicitly truthy.
export function isQuoteExternalPackageEditEnabled(): boolean {
  return readBooleanEnv('QUOTE_EXTERNAL_PACKAGE_EDIT');
}
