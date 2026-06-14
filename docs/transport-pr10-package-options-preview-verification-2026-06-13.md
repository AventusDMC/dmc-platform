# PR 10A — Route-vs-Package Options Preview (display-only): Verification

**Date:** 2026-06-13
**Branch:** `transport-contract-regime-pr10a`

PR 10A adds a **display-only** route-vs-package transport preview in the quote builder.
**Diagnostic only:** no save, no apply, no selection, no quote-total change, no
supplier/method change, no package activation.

## What it does
- New `PackagePricingPreview.tsx` — a flag-gated, read-only component mounted **additively**
  in `QuoteItineraryTab.tsx` (after the summary strip). It fetches the PR 9 shadow endpoint
  via a new proxy and renders the comparison.
- New proxy `GET /api/transport-pricing/quotes/:id/package-pricing-shadow` → forwards (GET,
  read-only) to `{API}/transport-pricing/quotes/:id/package-pricing-shadow`.

## Feature flag
- **`NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTIONS_PREVIEW`**, default **OFF**.
  - OFF → component renders `null` and **performs no fetch** (the `useEffect` early-returns).
  - ON → fetches + renders the diagnostic.
- The API endpoint stays separately gated by `transport.packagePricingShadowCompare`; if
  that's OFF the endpoint returns `{enabled:false}` and the preview shows "Preview disabled —
  enable transport.packagePricingShadowCompare on the API."

## Preview content (read-only)
Current route/transfer total · package gross total · supplier discount % + amount · package
net total · difference · eligible/ineligible + reason · counted full package days ·
manual-required days · excluded days (with reasons incl. stationary) · warnings ·
**"NOT APPLIED — preview only"** · "Package option selection will be available in a future
step." · "standard Alpha Large Bus 49 rate only — not the VIP 31–33 live rate."

## User interaction
**No apply/select button** (no `<button>` in the component); GET only; no `POST`/`PATCH`.
No silent cheapest selection.

## Tests
`PackagePricingPreview.test.ts` — **8 source-grep tests pass** (`tsx --test`): flag gating
(OFF → null + no fetch) · fetches the GET proxy · display-only (no mutating method, no
button, NOT-APPLIED shown, future-step text) · required diagnostic fields · standard-Large-49
note · additive mount in the tab · **PR 7 day-edit fragments preserved** · proxy is GET-only.
admin-web typecheck: no errors in the changed files.

## Confirmation — no quote/pricing behavior changed
- **Read-only**: GET proxy → read-only PR 9 endpoint; component has no save/apply, no
  `POST`/`PATCH`, no totals math. No quote mutation, no recalculation.
- No API/schema/migration/DB-write; `quotes.service.ts` untouched; no `DAILY_PACKAGE`, no
  overnight/stationary charging, no package selection/activation.
- **Quote-WIP stash untouched** — PR 10A touches none of the stash files
  (`QuoteServicePlanner`, `QuoteItemCard`, `excursion-origin-display.ts/.test.ts`); the
  preview is a new component mounted in the non-stash `QuoteItineraryTab.tsx`.

## Files (PR 10A)
| File | Type |
|---|---|
| `apps/admin-web/app/quotes/[id]/PackagePricingPreview.tsx` | new (read-only preview) |
| `apps/admin-web/app/api/transport-pricing/quotes/[id]/package-pricing-shadow/route.ts` | new (GET proxy) |
| `apps/admin-web/app/quotes/[id]/QuoteItineraryTab.tsx` | modified (additive mount) |
| `apps/admin-web/app/quotes/[id]/PackagePricingPreview.test.ts` | new (source-grep test) |
| `docs/transport-pr10-package-options-preview-plan-2026-06-13.md` + this | docs |

## Note (excluded from this PR)
A working-tree auto-fix to `apps/api/src/quotes/proposal-v3-pdf-export.test.ts` (null-guards
before `.find()`, likely a linter) appeared during this work. It is **unrelated to PR 10A**
and was **left untouched and excluded** from the PR (not staged, not reverted).

## Rollback
Flag OFF disables the preview (instant). No schema/data → reverting the PR removes the
component/proxy/mount cleanly; live pricing was never touched.
