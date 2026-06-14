# PR 10B-2 — Route-vs-Package selection UI: Verification

**Date:** 2026-06-14
**Branch:** `transport-contract-regime-pr10b2` (from `origin/main`)
**Read-state design:** Option A — extend the existing PR9 pricing-shadow GET response (read-only).

PR 10B-2 adds UI to **save / clear** a planner's route-vs-package selection through the
PR 10B-1 metadata endpoint, and surfaces the persisted selection + a stale/invalid flag from the
pricing-shadow response. **Metadata only — never applied to quote totals or items.**

## Files
| File | Change |
|---|---|
| `apps/admin-web/app/quotes/[id]/PackagePricingPreview.tsx` | EXTEND — selection controls + saved-state inside the display-only panel; PATCH save/clear |
| `apps/admin-web/app/api/transport-pricing/quotes/[id]/package-selection/route.ts` | NEW — PATCH-only proxy → PR 10B-1 endpoint |
| `apps/admin-web/app/quotes/[id]/PackagePricingPreview.test.ts` | EXTEND — PR10A base (revised, flag-conditional) + PR10B-2 selection tests |
| `apps/api/src/transport-pricing/package-eligibility-shadow.service.ts` | EXTEND — additive read-only `savedSelection` + `selectionStale` on the PR9 response |
| `apps/api/src/transport-pricing/package-eligibility-shadow.service.test.ts` | EXTEND — PR10B-2 read-side tests |
| `docs/transport-pr10b2-selection-ui-plan-2026-06-14.md` + this | docs |

**No schema, no migration.** `prisma migrate status` = "Database schema is up to date!" (188
migrations, unchanged from PR 10B-1).

## Feature-flag behavior (verified by tests)
| Preview (`…OPTIONS_PREVIEW`) | Selection (`…OPTION_SELECTION`) | Result |
|---|---|---|
| OFF | (any) | Renders nothing, no fetch. |
| ON | OFF | Display-only PR10A behavior; **no selection controls, no PATCH**. |
| ON | ON | Selection controls + saved-state display. |

- API stays independently gated: reads by `transport.packagePricingShadowCompare`; the
  `savedSelection`/`selectionStale` block only populates when `transport.packageOptionSelection`
  is ON (test: absent when that flag OFF); the PATCH save by `transport.packageOptionSelection`
  (403 when OFF — PR 10B-1). Client-flag-on + API-flag-off ⇒ 403, no change.

## UI behavior
- Recommended **label only** (no auto-select, no auto-apply).
- **Select route** → PATCH `{ option: 'ROUTE_TRANSFER' }` (always enabled).
- **Select package** → PATCH `{ option: 'PACKAGE_MIN_FULL_DAY' }`; **disabled** unless an active
  package contract exists AND `manualRequiredDays === 0` AND `packageEligible`. Client sends
  **no contract id** — the API resolves the active contract server-side.
- **Clear selection** → PATCH `{ option: null }` (always enabled).
- Saved-state display: selected option type, contract id (package only), timestamp, selected-by.
- **Stale/invalid warning** when `selectionStale` is true.
- Persistent **NOT APPLIED TO TOTALS** in both selection-ON and selection-OFF branches.
- No apply button. Local state updates from the PATCH echo only — never refetches/recomputes
  quote totals.

## Saved-selection read + staleness (server-side, read-only)
`savedSelection { option, contractId, isManual, at, byUserId }` + `selectionStale` are computed
inside `evaluateQuotePackagePricingShadow` by reading the 5 persisted columns and re-checking
against the freshly resolved active package contract (`findFirst active: true`) and the current
eligibility result:
- **stale** if saved option is PACKAGE and: no active contract / id mismatch / no longer eligible
  / manual-required days > 0.
- ROUTE and "none" are never stale.
- The read path performs **no writes** (asserted: `quote.update` not called).
- Stale selections are surfaced as warnings only — never applied to totals.

## Sample `savedSelection` / `selectionStale` response (additive fields on the PR9 GET)
Valid package selection:
```json
{ "savedSelection": { "option": "PACKAGE_MIN_FULL_DAY", "contractId": "pilot-1",
  "isManual": false, "at": "2026-06-14T00:00:00.000Z", "byUserId": "user-1" },
  "selectionStale": false, "notApplied": true }
```
Stale (stored contract deactivated / mismatched / ineligible):
```json
{ "savedSelection": { "option": "PACKAGE_MIN_FULL_DAY", "contractId": "old-deactivated-contract", ... },
  "selectionStale": true, "notApplied": true }
```
Selection flag OFF:
```json
{ "savedSelection": null, "selectionStale": false }
```

## Tests
- **API** `package-eligibility-shadow.service.test.ts` — **38 pass** (6 new PR10B-2): savedSelection
  absent when flag OFF (and no write) · surfaced + not-stale for valid PACKAGE (no write) · ROUTE
  never stale · stale on id-mismatch · stale on missing contract · stale on below-minimum.
- **Admin-web** `PackagePricingPreview.test.ts` — **20 pass** (PR10A base revised + 13 PR10B-2):
  selection flag gates controls · Select route/package/Clear present · route→PATCH ROUTE_TRANSFER
  · package→PATCH PACKAGE_MIN_FULL_DAY (no client contract id) · clear→null · ineligible disables
  Select package · manual-required blocks · saved-state renders from `savedSelection` · stale
  warning renders · no apply button + NOT APPLIED TO TOTALS · only one mutating fetch (the
  selection PATCH) · recommended is label-only · proxy PATCH-only.
- **Build:** `nest build` passes. Admin-web source-grep tests pass. (Pre-existing baseline
  TS1202 errors in unrelated `*.test.ts` files are unchanged and not introduced here.)

## Confirmation — no live behavior changed
- The component issues exactly **one** mutating call (the selection PATCH); no POST/PUT/DELETE,
  no second PATCH; no quote-total write or refetch.
- The save path uses the PR 10B-1 endpoint unchanged (`writeSelection` → 5 columns only).
- The read path (`savedSelection`/`selectionStale`) is **read-only** (no `quote.update`).
- No schema/migration; `quotes.service.ts` untouched; quote totals and items unchanged.
- No DAILY_PACKAGE / driver-overnight / stationary charging; no apply; no manual override; no
  automatic cheapest selection; no PR 11 work.

## File safety
- Untouched: `QuoteServicePlanner.tsx`, `QuoteItemCard.tsx`, `excursion-origin-display.ts/.test.ts`
  (quote-WIP stash files), `quotes.service.ts`, schema/migrations.
- Quote-WIP stash (`stash@{0}: …pr2-wip-preserve-quotes-id-2026-06-13`) untouched.
- `apps/api/src/quotes/proposal-v3-pdf-export.test.ts` remains an unstaged modification — excluded
  (not staged/committed/reverted/stashed).
- No dana files; no `touring_route_days` cleanup.

## Rollback
Both client flags default OFF → no selection UI, no PATCH. API selection flag default OFF → save
rejects + savedSelection absent. No schema/data to revert. Live pricing never touched.
