# PR 7 — Planner UI for Per-Day Transport Metadata: Verification

**Date:** 2026-06-13
**Branch:** `transport-contract-regime-pr7` (from current `origin/main`)

PR 7 lets a planner set the PR 6 metadata (`transportDayType`, `vehicleRetained`,
`vehicleReleased`, `inRetainedBlock`) per itinerary day, via the day editor. **No schema,
no migration, no pricing/quote-total/method change, no package activation.**

## UI (in `QuoteItineraryDayForm.tsx`, edit mode only)
A collapsible **"Transport day (advanced)"** `<details>` section with:
- **Transport day type** select — Auto/Unset (→ NULL) + the 9 operational types.
- **Vehicle retention** — a **single select** (Auto/Unset · Vehicle retained · Vehicle
  released · Part of retained block). It writes exactly one boolean and clears the others,
  so retained+released can never both be set from the UI. If existing data is contradictory,
  a disabled **"Manual review required / conflict"** option shows and a warning prompts the
  planner to resolve it (the rest of the day still saves).
- Hint: "…never changes quote pricing." Section hidden on create (fields are update-only,
  mirroring `country`).

Loading: `QuoteItineraryTab` now passes the 4 fields into `initialValues`; the API read
(`findByQuoteId`, uses `include`) already returns them — so existing values populate the
controls; NULL → Auto/Unset.

## API (mirrors the `country` field)
- `UpdateQuoteItineraryDayDto` + controller `UpdateDayBody`/`toUpdateDayDto` + service
  `updateDay` gain the 4 optional fields. Endpoint unchanged: `PATCH /itinerary/day/:dayId`
  (proxy forwards the body as-is — no proxy change).
- **Validation:** `transportDayType` ∈ `OperationalTransportType` const (or null/empty→null),
  else 400. Booleans must be boolean/null. **`vehicleRetained && vehicleReleased` → 400.**
- **Safety:** retention is only validated/written when the request *touches* it — so a
  pre-existing contradictory day stays editable (title-only saves don't 400). Omitted fields
  are preserved. No auto-fill, no inference, no backfill.

## Tests
- `quote-itinerary.service.test.ts` — **24 tests pass** (13 existing + 11 new PR 7):
  title-only leaves metadata untouched; save `transportDayType`; retained/released/block each
  write one + clear others; Auto/Unset saves NULLs; contradiction → 400; invalid type → 400;
  omitted preserved; **writes ONLY day-metadata keys (no pricing/total fields)**.
- `QuoteItineraryDayEditing.test.ts` (source-grep) — all required fragments still present in
  the form + tab; negative assertions (no `/items`, no pricing fields, no `dayItems`/
  `poiAssignments`) still hold → unaffected.
- `nest build` passes. admin-web typecheck: no errors in the changed files (only pre-existing
  unrelated baseline errors in other test files).

## Confirmation — non-live-affecting
- No schema/migration/DB write beyond the existing day-update endpoint.
- The `updateDay` write contains **only** day-metadata keys (asserted) — no pricing/total/
  supplier fields; `quotes.service.ts` and live pricing functions untouched.
- Contradiction impossible via UI; rejected by API.
- No `DAILY_PACKAGE`, no `PACKAGE_MIN_FULL_DAY` pilot contract, no min-day enforcement, no
  overnight/stationary charging, no inline eligibility preview (stays in the debug endpoint).

## Files
| File | Change |
|---|---|
| `apps/api/src/quote-itinerary/quote-itinerary.dto.ts` | +4 optional fields |
| `apps/api/src/quote-itinerary/quote-itinerary.controller.ts` | body + `toUpdateDayDto` mapping |
| `apps/api/src/quote-itinerary/quote-itinerary.service.ts` | `updateDay` validation + conditional write |
| `apps/api/src/quote-itinerary/quote-itinerary.service.test.ts` | +11 PR 7 tests |
| `apps/admin-web/app/quotes/[id]/QuoteItineraryDayForm.tsx` | the two selects + payload |
| `apps/admin-web/app/quotes/[id]/QuoteItineraryTab.tsx` | pass metadata into `initialValues` (load existing) |
| `docs/transport-pr7-planner-ui-plan-2026-06-13.md` + this verification | docs |

`QuoteItineraryTab.tsx` is necessary wiring (so the form loads existing values); it is **not**
in the preserved quote-WIP stash (which holds QuoteItemCard / QuoteServicePlanner /
excursion-origin-display), so there is no conflict.

## Rollback
No schema → no DB rollback. Reverting the PR removes the controls + API fields; the PR 6
columns remain (harmless, NULL). Live pricing was never touched.
