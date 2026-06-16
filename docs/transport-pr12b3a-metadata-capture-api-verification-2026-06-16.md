# PR 12B-3A — Metadata capture API: Verification

**Date:** 2026-06-16
**Branch:** `transport-pr12b3a-metadata-capture-api` (from `origin/main`)
**Scope:** API support to save/clear `Supplier.baseCity`, `QuoteItineraryDay.overnightCity`,
`QuoteItineraryDay.vehicleReturnsToBase`. **Metadata only — no pricing, no schema, no UI.**

## Changes
- **Supplier** (`suppliers.controller.ts` + `suppliers.service.ts`): `baseCity?` on Create/Update
  bodies + inputs; new `normalizeCity()` (trim, blank → null, cap 120; undefined → unchanged) applied
  in `create` and `update`. No recalc; supplier update never touches quotes.
- **Quote day** (`quote-itinerary.dto.ts` + `quote-itinerary.controller.ts` +
  `quote-itinerary.service.ts`): `overnightCity?` / `vehicleReturnsToBase?` on
  `UpdateQuoteItineraryDayDto` + `UpdateDayBody` + `toUpdateDayDto`; `normalizeDayUpdateInput` now
  emits `overnightCity` (omitted = unchanged; blank → null; trimmed + capped 120) and
  `vehicleReturnsToBase` (boolean|null; invalid → 400); `updateDay` writes them. **No recalc**
  (`updateDay` is metadata-only).

## Rules honored
All optional · blank string → NULL · trimmed · max 120 for city fields · `vehicleReturnsToBase`
boolean|null only (invalid → 400) · omitted → unchanged · no auto-fill · no backfill · no inferred
values · **no pricing recalculation triggered**.

## Tests
- **`suppliers.service.test.ts` (new) — 6 pass:** save baseCity; clear → null; blank → null + long
  capped at 120; omitted → unchanged (undefined, not written); update writes only approved keys; create
  persists baseCity (and null when blank).
- **`quote-itinerary.service.test.ts` — 30 pass (+6 PR12B-3A):** save overnightCity; clear → null;
  blank → null + long capped 120; vehicleReturnsToBase true/false/null; invalid boolean → 400; omitted
  overnight fields preserved. The existing "writes ONLY day metadata keys" guard now includes
  `overnightCity` + `vehicleReturnsToBase` in `ALLOWED_KEYS` (no pricing/total keys).
- `nest build` passes (compiles all test files).

## Sample save/clear results
- Supplier: `update({ baseCity: 'Amman' })` → `baseCity = 'Amman'`; `update({ baseCity: null })` →
  `null`; `update({ baseCity: '   ' })` → `null`; `update({ name })` → `baseCity` unchanged.
- Day: `updateDay({ overnightCity: 'Petra' })` → `'Petra'`; `{ overnightCity: null }` → `null`;
  `{ overnightCity: '   ' }` → `null`; `{ vehicleReturnsToBase: true|false|null }` → as given;
  `{ vehicleReturnsToBase: 'yes' }` → **400**; `{ title }` → overnight fields unchanged.

## Confirmations
- **No pricing/quote behavior changed** — `quotes.service.ts` untouched (empty diff); `updateDay` /
  supplier `update` do not call `recalculateQuoteTotals`; no quote-total or pricing-method change.
- **No admin-web UI changes** (12B-3B); **no schema/migration** (12B-2 already added the columns);
  overnight/stationary remain blocked/warning-only; production live-apply flag OFF.
- Writes only approved metadata keys (asserted both sides). NULL = unknown/unset/manual-required
  (PR 12C reads these later).

## Files
- `apps/api/src/suppliers/suppliers.controller.ts`, `suppliers.service.ts`, `suppliers.service.test.ts`
- `apps/api/src/quote-itinerary/quote-itinerary.dto.ts`, `quote-itinerary.controller.ts`,
  `quote-itinerary.service.ts`, `quote-itinerary.service.test.ts`
- `docs/transport-pr12b3-metadata-capture-plan-2026-06-16.md` + this verification

## Out of scope (unchanged)
No admin-web UI (12B-3B); no shadow calc (12C); no live apply (12F); no PR 13; no production
activation; `QuoteServicePlanner`/`QuoteItemCard`/quote-WIP stash/dana untouched;
`proposal-v3-pdf-export.test.ts` excluded.
