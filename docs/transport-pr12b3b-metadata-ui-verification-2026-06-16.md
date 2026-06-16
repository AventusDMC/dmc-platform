# PR 12B-3B — Metadata capture UI: Verification

**Date:** 2026-06-16
**Branch:** `transport-pr12b3b-metadata-capture-ui` (from `origin/main`)
**Scope:** admin-web UI to capture/edit `Supplier.baseCity`, `QuoteItineraryDay.overnightCity`,
`QuoteItineraryDay.vehicleReturnsToBase` using the existing PR 12B-3A endpoints.
**UI capture only — no schema, no API behavior change, no pricing, no recalc.**

## Changes
- **Supplier** (`SuppliersForm.tsx` + `SuppliersTable.tsx`): new transport-only **"Base city"**
  text input under "Transport discount %"; help text *"Used later for driver overnight evaluation.
  Leave blank if unknown. This does not change pricing yet."* `baseCity` added to the existing
  POST/PATCH `/suppliers` body (transport only; blank/whitespace → `null`, trimmed). Edit form
  seeds `baseCity` from the row (`SuppliersTable` initialValues). New-supplier reset clears it.
- **Quote day** (`QuoteItineraryDayForm.tsx` + `QuoteItineraryTab.tsx`): inside the existing
  **"Transport day (advanced)"** section, two controls — **"Overnight city / area"** (text, blank →
  `null`, trimmed) and **"Vehicle returns to base overnight?"** tri-state select (Auto/Unknown →
  `null`, Yes → `true`, No → `false`); help text *"Used later for overnight pricing. This does not
  change pricing yet."* Both added to the existing PATCH `/itinerary/day/:id` payload (edit-only).
  Tab seeds `overnightCity` / `vehicleReturnsToBase` into the day form initialValues.

## Data flow (no API/proxy change)
- Supplier list GET (`suppliers.service.findMany`, no `select`) already returns `baseCity`; the
  itinerary read uses `include` on the day model, so `overnightCity` / `vehicleReturnsToBase` are
  returned automatically. Supplier + day update endpoints (PR 12B-3A) already accept the fields.
  Existing proxies forward the body verbatim — **no new endpoint, no new/changed proxy.**

## Validation (UI mirrors server; server is source of truth)
- All optional · blank/whitespace → `null` · trimmed client-side · `vehicleReturnsToBase` only ever
  `true | false | null` (tri-state) · no auto-fill · no inference · no automatic save · no pricing
  preview. Server still caps cities at 120 and 400s a non-boolean as a backstop.

## Tests
- **`QuoteItineraryDayEditing.test.ts` (source-grep) — 8 pass** (5 existing R.1d + 3 new PR 12B-3B):
  new controls present, payload writes `overnightCity` / `vehicleReturnsToBase` only, tab seeds
  initialValues; existing no-pricing / no-relation guards still hold.
- **`SuppliersForm.test.ts` (new source-grep) — 4 pass:** Base city input + help text; `baseCity`
  in body (transport-only, blank → null); reuses `/suppliers` POST/PATCH; no pricing fields; table
  seeds initialValues.
- `tsc --noEmit`: my four source files compile clean; the 7 repo-baseline TS1202 errors are all in
  unrelated pre-existing `*.test.ts` files (not touched here).

## Confirmations
- **No pricing/quote-total change** — controls only persist metadata via existing PATCH paths; no
  recalc, no QuoteItem mutation, no engine/contract/flag touch. Live-apply flag remains OFF;
  overnight/stationary remain blocked.
- **No schema / migration / API behavior change** (12B-2 + 12B-3A already shipped those).
- **No unrelated files** — `proposal-v3-pdf-export.test.ts` left modified-but-uncommitted (stays
  excluded); `apps/api/o2b2i-setup7.ts` (unrelated untracked) not included.
- `QuoteServicePlanner` / `QuoteItemCard` / quote-WIP stash / dana untouched.

## Files
- `apps/admin-web/app/suppliers/SuppliersForm.tsx`, `SuppliersTable.tsx`, `SuppliersForm.test.ts`
- `apps/admin-web/app/quotes/[id]/QuoteItineraryDayForm.tsx`, `QuoteItineraryTab.tsx`,
  `QuoteItineraryDayEditing.test.ts`
- `docs/transport-pr12b3b-metadata-ui-plan-2026-06-16.md` + this verification

## Out of scope (unchanged)
No shadow calc (12C); no planner UI (12D); no controlled validation (12E); no live apply (12F);
no PR 13; no production activation; `proposal-v3-pdf-export.test.ts` excluded.
