# PR 12B-3 — Admin/API capture for base-city + day overnight metadata (PLAN ONLY)

**Date:** 2026-06-16
**Status:** PLAN ONLY — no code/schema/migration/DB/pricing/quote change.
**Goal:** let planners/admins SET the PR 12B-2 nullable fields (`Supplier.baseCity`,
`QuoteItineraryDay.overnightCity`, `vehicleReturnsToBase`). **Metadata only — no pricing.** Flag OFF;
overnight/stationary stay blocked.

## Discovered files / patterns (read-only)
- **Supplier update:** `apps/api/src/suppliers/suppliers.controller.ts` (`UpdateSupplierBody`,
  `@Patch(':id') update`) → `suppliers.service.ts` (`UpdateSupplierInput`, `update()` →
  `prisma.supplier.update`). Admin form: `apps/admin-web/app/suppliers/SuppliersForm.tsx`.
- **Quote day update (PR7 path):** `apps/api/src/quote-itinerary/quote-itinerary.controller.ts`
  (`UpdateDayBody` + `toUpdateDayDto`), `quote-itinerary.dto.ts` (`UpdateQuoteItineraryDayDto` —
  already carries `transportDayType`/`vehicleRetained`/etc.), `quote-itinerary.service.ts`
  (`updateDay` — metadata-only, **no recalc**). Admin: `QuoteItineraryDayForm.tsx`
  ("Transport day (advanced)" section) + `QuoteItineraryTab.tsx` (initialValues).
- `updateDay` and `suppliers.update` do **not** call `recalculateQuoteTotals` → metadata saves never
  trigger pricing.

## 1. Supplier base city capture
- **Where:** the existing **Supplier admin** (`SuppliersForm.tsx`) — same form that edits
  `transportDiscountPercent` today; no new page. API via the existing supplier `update` (the proxy
  forwards the whole body — **no new proxy expected**; verify).
- **UI:** label **"Base city"**, help text **"Used later for driver overnight evaluation. Leave blank
  if unknown."** A select with suggested values (Amman / Aqaba / Petra / Wadi Rum / Dead Sea / Other
  → free text) backed by a free-text field. **No DB enum** (keep `String?`; the suggested list is a
  UI convenience, "Other" allows free text) — recommended, to avoid a migration and stay flexible.

## 2. Quote-day overnight metadata capture
- **Where:** extend **`QuoteItineraryDayForm.tsx`** "Transport day (advanced)" (the PR7 area). **Do
  NOT touch `QuoteServicePlanner` / `QuoteItemCard`.**
- **UI:**
  - **"Overnight city / area"** — select: Auto/Unset · Amman · Petra · Wadi Rum · Aqaba · Dead Sea ·
    Other → free text. Empty/Auto → saves NULL.
  - **"Vehicle returns to base overnight?"** — select: Auto/Unknown · Yes · No → maps to
    `true`/`false`/`null`.
  - Helper: **"This does not change pricing yet."**

## 3. API / DTO updates
- **Supplier:** add `baseCity?: string | null` to `UpdateSupplierBody` (controller) + `UpdateSupplierInput`
  (service); in `update()`, `baseCity: data.baseCity === undefined ? undefined : (data.baseCity?.trim()
  || null)`. (Add to create path too if desired; optional.)
- **Quote day:** add `overnightCity?: string | null` and `vehicleReturnsToBase?: boolean | null` to
  `UpdateQuoteItineraryDayDto` + the controller `UpdateDayBody` + `toUpdateDayDto` mapping + `updateDay`
  data (only-when-touched, like the PR7 retention fields). Blank string → NULL; trim; boolean coerced
  (reject non-boolean).
- **Rules (all):** optional; blank → NULL; trim text; no auto-fill; no backfill; omitted → unchanged;
  invalid boolean → 400; **no pricing recalculation** (these update paths don't recalc).

## 4. Validation rules
- `baseCity`: string|null, trimmed, max ~120 chars.
- `overnightCity`: string|null, trimmed, max ~120 chars.
- `vehicleReturnsToBase`: boolean|null (reject other types → 400).
- **Not** required: do not require `overnightCity` when `vehicleReturnsToBase=false` (PR 12C fails
  closed later); do not require `baseCity`. **No city enum yet** (recommended — keep flexible).

## 5. UX safety
- Existing suppliers show blank base city; existing days show Auto/Unset.
- Save is explicit only; no inferred values persisted; no pricing preview shown.
- Helper text "This does not change pricing yet."
- If `overnightCity` is set on a released/free day, just save the metadata (PR 12C may warn later).

## 6. Tests
- Supplier `baseCity` loads blank when NULL; save works; clear → NULL.
- Day `overnightCity` loads Auto when NULL; save works; clear → NULL.
- `vehicleReturnsToBase` true/false saves; clear → NULL.
- Omitted fields unchanged; invalid boolean rejected; blank string → NULL.
- **No quote total change; no pricing method change; no overnight/stationary pricing activation.**
- Admin-web source-grep tests (`QuoteItineraryDayEditing.test.ts`, any `SuppliersForm` test) keep
  their existing required fragments (additive edits only).

## 7. Conflict risk (report before implementation)
- **Quote-WIP stash files:** NOT touched. Stash = `QuoteItemCard.tsx`, `QuoteServicePlanner.tsx`,
  `excursion-origin-display.ts/.test.ts`. PR 12B-3 edits `QuoteItineraryDayForm.tsx` /
  `QuoteItineraryTab.tsx` (not in the stash; PR7 already edited these) + supplier files.
- **`QuoteServicePlanner` / `QuoteItemCard`:** NOT touched.
- **`proposal-v3-pdf-export.test.ts`:** remains the unrelated unstaged change — staged by explicit
  path only, never `git add -A`, verified absent from the PR diff before merge.

## 8. File list (expected)
- `apps/api/src/suppliers/suppliers.controller.ts`, `suppliers.service.ts` (+`baseCity`).
- `apps/api/src/quote-itinerary/quote-itinerary.dto.ts`, `quote-itinerary.controller.ts`,
  `quote-itinerary.service.ts` (+`overnightCity`, `vehicleReturnsToBase`).
- `apps/admin-web/app/suppliers/SuppliersForm.tsx` (+ supplier update proxy only if one isn't already
  forwarding the body — verify; likely no new proxy).
- `apps/admin-web/app/quotes/[id]/QuoteItineraryDayForm.tsx` (+ `QuoteItineraryTab.tsx` initialValues;
  day-update proxy already exists from PR7).
- Tests: API quote-itinerary day test + suppliers test; admin-web source-grep tests.
- `docs/transport-pr12b3-…-verification-*.md`.
- **No schema/migration.** `quotes.service.ts` untouched.

## 9. Risks
- **City text inconsistency / free-text typos** → future rate-lookup misses: mitigate with the
  suggested-value dropdown (+ "Other"); PR 12C normalizes text → `*_OVERNIGHT` code and fails closed
  on unknown city.
- **Accidental pricing recalc on save** → none: the supplier/day update paths don't call recalc;
  assert in tests.
- **Touching quote-WIP files** → avoided (only `QuoteItineraryDayForm`/`Tab` + supplier files).
- **Admin confusion (metadata doesn't price yet)** → "This does not change pricing yet." helper.

## 10. Acceptance criteria
- `baseCity` / `overnightCity` / `vehicleReturnsToBase` can be saved and cleared (→ NULL).
- Existing rows unchanged; NULL = unknown; omitted → unchanged.
- **No pricing behavior change; no quote total change**; overnight/stationary remain blocked/warning-
  only; production live-apply flag OFF.
- No schema/migration; `quotes.service.ts` untouched; stash/dana untouched; `proposal-v3` excluded.

## Recommended split
- **PR 12B-3a (recommended):** API DTO/service capture (supplier + day) + tests.
- **PR 12B-3b:** admin-web UI (SuppliersForm + QuoteItineraryDayForm) + source-grep tests.
- (Or a single PR 12B-3 if you prefer — small, additive.) Then PR 12C shadow calculation.

## Strictly not in this step
No implementation; no schema/migration/DB/pricing/quote/contract change; no PR 12C–F; no PR 13; no
production activation; quote-WIP stash + dana untouched; `proposal-v3-pdf-export.test.ts` excluded.
