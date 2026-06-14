# PR 11A — Live apply (pilot-pinned) : Verification

**Date:** 2026-06-14
**Branch:** `transport-contract-regime-pr11a` (from `origin/main`)
**Flag:** `transport.packagePricingLiveApply` (env `TRANSPORT_PACKAGE_PRICING_LIVE_APPLY`), **default OFF**
**Pilot contract (pinned by id):** `66f5de06-28df-426c-90b8-ffaa01ed5c5f` (Alpha Large Bus USD)

PR 11A is the **first live-apply step**. When the flag is ON, a saved **valid** PACKAGE
selection adjusts a quote's transport totals via a **total-level additive delta** computed by
`computeQuotePackageLiveApply`. It **never mutates QuoteItem rows**, is **pinned to the single
pilot contract**, and falls back to existing pricing on any gate failure. Flag OFF → no change.

## Files (no schema, no migration)
| File | Change |
|---|---|
| `apps/api/src/transport-pricing/transport-feature-flags.ts` | `transport.packagePricingLiveApply` flag (default OFF) |
| `apps/api/src/transport-pricing/package-eligibility-shadow.service.ts` | `computeQuotePackageLiveApply()` + `PILOT_PACKAGE_CONTRACT_ID` + `LivePackageApplyResult` |
| `apps/api/src/quotes/quotes.service.ts` | optional 6th ctor dep + flag-gated total-level delta in `recalculateQuoteTotals` |
| `apps/api/src/transport-pricing/package-eligibility-shadow.service.test.ts` | +16 PR11A decision/math tests |
| `apps/api/src/quotes/quote-package-live-apply.test.ts` | NEW — recalc wiring (flag OFF/ON, no item mutation) |
| `docs/transport-pr11-live-apply-plan-2026-06-14.md` + this | docs |

## Injection model (D2a — no item mutation)
`recalculateQuoteTotals` computes `isSlabMode`, then (only when the dependency is present **and**
the flag is ON) calls `computeQuotePackageLiveApply(quoteId, { pricingIsSlab, recalcItemIds })`.
If `apply` is true, the returned `costDelta`/`sellDelta` are added at total-assembly time:
`totalCost = itemSum.cost + passCost + costDelta`; FIXED `totalSell = itemSum.sell + passSell +
sellDelta`. **No `QuoteItem` row is written.** Errors are caught → fall back to existing pricing.
The shadow-service dependency is an **optional** ctor param so the ~20 manual
`new QuotesService(prisma, …5 args)` test sites compile unchanged; in the app it is DI-injected.

## Validation gates (all re-validated server-side; any failure → existing pricing + reason)
`no-selection` · `route-selected` · `not-pilot-contract` (pinned by id) · `slab-mode-not-supported`
· `overlap-excursion-package-rate` · `contract-inactive-or-missing` (stale/deactivated) ·
`contract-wrong-regime` · `contract-not-usd` · `cross-currency` · `no-primary-transport` ·
`supplier-class-mismatch` (Alpha VIP / non-pilot supplier) · `manual-required-days` ·
`below-minimum`/ineligible · `stationary-standby-present` · `addon-overnight-present`
(driver-overnight ADD_ON) · `day-membership-mismatch` · `no-counted-cost` · `markup-uncomputable`.

## Pricing formula (D1a — preserves transport margin)
- Counted days = `packageDayWeight > 0` (the days the package replaces). `countedCost`/`countedSell`
  = their persisted transport cost/sell.
- `packageGross` = (billedAtMinimum ? minimumFullDays : fullDayCount)×fullDayRate + halfDayCount×
  halfDayRate. **Supplier discount applied EXACTLY ONCE**: `packageNet = packageGross × (1 −
  discount%)`.
- **Weighted-average markup** `m = countedSell / countedCost` (blocks if non-positive/NaN).
- `costDelta = packageNet − countedCost`; `sellDelta = packageNet × m − countedSell`.
- **Excluded transfer days** (airport, released P2P, etc.) are NOT in the counted base → they keep
  their existing persisted cost in the item-sum totals (retained, untouched).

## Sample before/after (from the unit tests, FIXED-mode pilot quote)
3 touring days, each cost 700 / sell 840 (20% markup); Alpha discount 25%; Large Bus fullDayRate 656.
- Baseline transport: cost 2100, sell 2520.
- `packageGross` = 3×656 = 1968 → `packageNet` = 1968×0.75 = **1476**.
- `costDelta` = 1476 − 2100 = **−624**; `m` = 2520/2100 = 1.20; `sellDelta` = 1476×1.20 − 2520 =
  **−748.8**.
- Quote with item-sum cost 1500 / sell 1800 → applied: **totalCost 876, totalSell 1051.2** (flag
  ON). Flag OFF → **1500 / 1800** (baseline). Adding a day-4 airport transfer (cost 200) leaves
  `countedCost` = 2100 and the same delta — the airport day is retained.

## Tests
- `package-eligibility-shadow.service.test.ts` — **54 pass** (+16 PR11A): no-selection · route ·
  valid pilot apply (delta/discount-once/weighted-markup, no writes) · not-pilot-id · stale/inactive
  · below-minimum · manual-required · stationary · driver-overnight ADD_ON · cross-currency · Alpha
  VIP/other class · non-pilot supplier · excursionPackageRate overlap · SLAB · day-membership
  mismatch · excluded airport retained.
- `quote-package-live-apply.test.ts` — **3 pass**: flag OFF → shadow not called, totals = baseline
  (rollback); flag ON + apply → totals include delta, **no QuoteItem update**; flag ON + apply:false
  → totals unchanged (fallback).
- `nest build` passes (compiles all `*.test.ts`, confirming the optional ctor arg ripple is clean).
- Regression: `quote-pricing-scenarios.test.ts` (65 pass), `package-apply-quote-context.test.ts`
  (4 pass) green. `finance/quote-booking-pricing-integrity.test.ts` fails on `booking.findUnique`
  in `convertToBooking` — **pre-existing baseline failure** (verified identical with PR11A changes
  stashed); unrelated to this change.

## Confirmation — no live behavior changed unless explicitly enabled
- Flag default OFF → `computeQuotePackageLiveApply` is never called; totals computed exactly as
  today (proved by the flag-OFF wiring test).
- Apply is pinned to the single pilot contract id; non-pilot / VIP / non-USD / cross-currency /
  multi-supplier / SLAB / overlap all fall back to existing pricing.
- **No QuoteItem rows mutated** (asserted). No supplier/method switching. No DAILY_PACKAGE, driver
  overnight, or stationary charging. No `excursionPackageRate` retirement. No schema/migration.

## Rollback (D5 — conservative)
- **Flag OFF prevents all future application** immediately (next recompute uses baseline).
- Already-recomputed pilot quotes (if the flag was ON) are **not** auto-reverted. To restore their
  persisted totals, run a **targeted, manual** recompute of affected pilot quotes only — do NOT run
  automatically. Process: identify quotes with `selectedTransportPricingOption =
  'PACKAGE_MIN_FULL_DAY'` AND `selectedTransportContractId =
  '66f5de06-28df-426c-90b8-ffaa01ed5c5f'`, set `TRANSPORT_PACKAGE_PRICING_LIVE_APPLY` OFF, then
  trigger one recalculation per quote (any item save/touch invokes `recalculateQuoteTotals`, which
  with the flag OFF reproduces the baseline totals). No DB rollback needed (Option A — no schema).

## File safety
- Quote-WIP stash (`stash@{0}: …pr2-wip-preserve-quotes-id-2026-06-13`) untouched; stash files
  (`QuoteItemCard.tsx`, `QuoteServicePlanner.tsx`, `excursion-origin-display.ts/.test.ts`) not
  touched.
- `apps/api/src/quotes/proposal-v3-pdf-export.test.ts` remains an unstaged modification — excluded.
- No dana files; no `touring_route_days` cleanup; no UI change; no PR 11B/12/13 work.
