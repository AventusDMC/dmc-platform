// Product Catalog V2 — Slice 1 backend feature flag.
//
// DEFAULT OFF / fail-closed. The read-only aggregator route composes/returns
// NOTHING unless CATALOG_V2_ENABLED is explicitly the string 'true'. This is the
// independent backend kill-switch — the frontend flag is separate.
export function isCatalogV2Enabled(): boolean {
  return String(process.env.CATALOG_V2_ENABLED ?? '').trim() === 'true';
}
