# PR 10 — Route-vs-Package Options Preview (PLAN ONLY)

**Date:** 2026-06-13
**Status:** PLAN ONLY — no code. For approval.
**Goal:** Surface the route-vs-package transport comparison in the quote builder as a
**display-only preview/diagnostic**, flag-gated, **not auto-applied**. No live quote-total
change.

## 1. Recommended split (display-only first)
- **PR 10A (this PR — recommended):** **display-only** package-pricing preview in the quote
  builder. Reads the PR 9 shadow endpoint, renders read-only. **No save, no apply, no
  selection, no total change.**
- **PR 10B (later, separate approval):** persist a planner's manual option selection on the
  quote — still **not applied** to totals (needs a small metadata field; touches more).
- **PR 11 (later, explicit):** live activation — apply the selected package option to totals.

Matches your preference: **PR 10 = display-only preview.**

## 2. UI location — a NEW component in a non-stash file
- **New component `PackagePricingPreview.tsx`** (self-contained), mounted **once** in
  **`QuoteItineraryTab.tsx`** as a collapsible "Transport package preview (advanced)" panel.
- **Explicitly NOT `QuoteServicePlanner.tsx` / `QuoteItemCard.tsx`** — both are in the
  preserved quote-WIP stash (see §9). `QuoteItineraryTab.tsx` is **not** in the stash and was
  already safely edited in PR 7. `page.tsx` is avoided too (it has a `page.test.tsx`
  source-grep test).

## 3. Feature flag
- New UI flag **`transport.packageOptionsPreview`** (admin-web env
  `NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTIONS_PREVIEW`), **default OFF**.
- **OFF:** the component renders `null` — **no UI, no endpoint call**.
- **ON:** fetches + shows the preview only. (The API endpoint itself is still separately
  gated by PR 9's `transport.packagePricingShadowCompare`; if that's OFF the endpoint returns
  `{enabled:false}` and the preview shows "preview disabled — API flag off".)
- Two independent gates (UI + API) — both must be ON to see data; neither changes pricing.

## 4. Data source / flow
- Reuse the PR 9 endpoint via a **new admin-web proxy**:
  `GET /api/transport-pricing/quotes/:id/package-pricing-shadow` →
  `GET {API}/transport-pricing/quotes/:id/package-pricing-shadow` (auth headers via the
  existing `buildActorHeaders` pattern, like the day proxy).
- **No package pricing logic duplicated in admin-web** — the component only renders the
  endpoint's JSON. GET only; no PATCH/POST.

## 5. UI content (read-only)
Current route/transfer total · package candidate total (net) · gross + supplier discount %
+ amount · difference · packageEligible / reason · countedFullPackageDays · fullDay/halfDay
counts · manual-required days · excludedDays (with reasons incl. stationary) · warnings
(incl. `standard-large-bus-49-rate-only-not-vip-31-33`, `stationary-not-priced-in-pr9`) · a
clear **"NOT APPLIED — preview only"** badge.

## 6. User interaction
- **No apply/select button in PR 10A** (your preference). If a control is shown at all, it is
  a **disabled** "Apply package option (future step)" placeholder. **No silent cheapest
  selection**; both totals are shown, nothing chosen.

## 7. Safety
No quote total change · no save/apply · no supplier/method switch · no recalculation (GET a
read-only endpoint; no quote mutation) · no package activation · no `DAILY_PACKAGE` · no
overnight/stationary charging · no schema/migration/DB write · no PR 11 work.

## 8. Tests
- Flag OFF → component renders null; **no fetch** (assert no endpoint URL call path taken).
- Flag ON → fetches `/api/transport-pricing/quotes/:id/package-pricing-shadow`.
- Eligible → shows current vs package totals + difference.
- Ineligible → shows reason (`below-minimum` / `no-package-contract`).
- Manual-required days → shown as warning/excluded.
- Stationary days → warning/excluded shown, never priced.
- `notApplied` rendered clearly; **no apply/save action present** (assert no PATCH/POST in the
  component source).
- **No source-grep breakage:** `QuoteItineraryDayEditing.test.ts` (greps `QuoteItineraryTab`)
  and `page.test.tsx` fragments remain intact (additive mount only).
- (admin-web tests are source-grep style via `readFileSync` — the preview test will assert
  the component's fragments: fetch URL, `notApplied`, warnings, no apply mutation.)

## 9. Quote-WIP stash conflict analysis
- Stash `stash@{0}` = **4 tracked files**: `QuoteItemCard.tsx` (+7), `QuoteServicePlanner.tsx`
  (+7), `excursion-origin-display.ts` (+17), `excursion-origin-display.test.ts` (+34). No
  untracked part.
- **PR 10A overlap: NONE.** PR 10A touches a new component, a new proxy, `QuoteItineraryTab.tsx`,
  a new test, and docs — **none of which are in the stash.** Restoring the stash later will
  **not** conflict with PR 10A.
- **The stash stays untouched** (not restored, not dropped). No special branch/merge plan
  needed — simply avoid the 4 stash files.

## 10. Exact file list (PR 10A)
| File | Type |
|---|---|
| `apps/admin-web/app/quotes/[id]/PackagePricingPreview.tsx` | new (read-only preview component, flag-gated) |
| `apps/admin-web/app/api/transport-pricing/quotes/[id]/package-pricing-shadow/route.ts` | new (GET proxy) |
| `apps/admin-web/app/quotes/[id]/QuoteItineraryTab.tsx` | modified (additive mount of the preview) |
| `apps/admin-web/app/quotes/[id]/PackagePricingPreview.test.ts` | new (source-grep test) |
| `docs/transport-pr10-package-options-preview-plan-2026-06-13.md` (this) + verification doc | docs |
*(No API/schema/migration changes — PR 9 endpoint already exists. No `quotes.service.ts`, no
`QuoteServicePlanner`/`QuoteItemCard`.)*

## Risks & mitigations
| Risk | Mitigation |
|---|---|
| Conflict with quote-WIP stash | Avoid the 4 stash files entirely; mount in `QuoteItineraryTab` (verified not in stash) |
| `page.test.tsx` / `QuoteItineraryDayEditing` source-grep breakage | Additive mount; preserve asserted fragments; new component is separate |
| Accidental apply/recalc | GET-only proxy; component has no PATCH/POST; no quote mutation |
| Flag leakage to users | UI flag default OFF (env unset → null) + API flag default OFF; both required |
| Confusing standard vs VIP rate | Warning surfaced verbatim in the preview |

## Acceptance criteria
- Flag OFF = no preview, no endpoint call; Flag ON = read-only preview only.
- No quote total change, no apply/save, no supplier/method change, no schema/migration/DB write.
- `notApplied` shown; no apply action (or disabled "future step").
- Quote-WIP stash files untouched; tests pass; admin-web build passes; PR limited to the
  listed files.

## Open decisions for you
1. Confirm **PR 10A display-only** (recommended) vs bundling selection now.
2. Confirm mount in **`QuoteItineraryTab.tsx`** (recommended, non-stash) vs a separate debug panel.
3. Confirm **no apply button** (recommended) vs a disabled "future step" placeholder.
