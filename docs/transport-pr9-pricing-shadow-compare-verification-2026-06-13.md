# PR 9 — Pricing Shadow-Compare: Verification (read-only, flag-gated)

**Date:** 2026-06-13
**Branch:** `transport-contract-regime-pr9`

PR 9 adds a **read-only** debug endpoint that compares the current route/transfer transport
total against a package candidate total. **No live pricing change, no quote-total change, no
writes, no recalculation.**

## Endpoint
`GET /transport-pricing/quotes/:id/package-pricing-shadow` — `@Roles('admin','finance')`
(global `GlobalAuthGuard` + `RolesGuard`). Flag `transport.packagePricingShadowCompare`
(env `TRANSPORT_PACKAGE_PRICING_SHADOW_COMPARE`), **default OFF** → `{ enabled:false }`.
Separate from the PR 5 eligibility endpoint/flag.

## Baseline (safe read)
`currentTransportTotal` = sum of **persisted** transport `QuoteItem` costs
(`useOverride ? (finalCost ?? overrideCost ?? totalCost) : (finalCost ?? totalCost)`).
**No `calculateCreateOrUpdateQuoteItemServiceCost`, no `recalculateQuoteTotals`, no writes.**

## Package candidate (shadow)
- Eligible only via the pilot `PACKAGE_MIN_FULL_DAY` contract (PR 4–6 logic).
- `packageDaysGross = fullDayCount × fullDayRate + halfDayCount × halfDayRate` (or
  `minimumFullDays × fullDayRate` under `CHARGE_MINIMUM_DAYS`).
- **Supplier-discount parity:** `packageDaysNet = packageDaysGross × (1 − supplierDiscountPercent/100)`
  (Alpha 25%), so it compares fairly to the net persisted baseline.
- Non-counted transport days (airport / released / candidate / stationary) keep their
  persisted route cost (`excludedDays`), covered in both totals.
- **`packageCandidateTotal = packageNetTotal`** (the apples-to-apples comparison).

## Diagnostic output (fields)
`currentTransportTotal`, `packageGrossTotal`, `supplierDiscountPercent`,
`supplierDiscountAmount`, `packageNetTotal`, `packageCandidateTotal`, `difference`,
`packageEligible`, `packageContractId`, `countedFullPackageDays`, `fullDayCount`,
`halfDayCount`, `billableDays`, `billedAtMinimum`, `manualRequiredDays`, `excludedDays[]`,
`reason`, `dayPlan`, `warnings`, `notApplied: true`.

## Sample output (verified by test — 3 full days, $700/day persisted, Alpha 25%)
```
currentTransportTotal: 2100      (persisted baseline)
packageGrossTotal:     1968      (3 × 656)
supplierDiscountPercent: 25
supplierDiscountAmount:  492
packageNetTotal:       1476      (1968 × 0.75)
packageCandidateTotal: 1476      (net = comparison total)
difference:            -624      (1476 - 2100)
packageEligible: true · notApplied: true
warnings: ['standard-large-bus-49-rate-only-not-vip-31-33', 'excludes-driver-overnight']
```

## Stationary & overnight (PR 9 = not priced)
Stationary days are **excluded** (`excludedDays` with `reason: 'stationary'`) and **warned**
(`stationary-not-priced-in-pr9`), never added to the package total. Driver overnight is not
priced (`excludes-driver-overnight` warning). Standard Alpha Large 49 rate only — the
VIP 31-33 premium is **not** used (warning emitted).

## Tests
`package-eligibility-shadow.service.test.ts` — **23 tests pass** (16 prior + 7 new PR 9):
flag OFF → null; flag ON → comparison only; 3 full days → net candidate with 25% applied;
2 days → below-minimum, no candidate (baseline still computed); manual-required → excluded,
no candidate; airport-only → excluded; stationary → excluded + warned; no contract →
`no-package-contract`; pilot **standard Large Bus 49** rate (656) used. `nest build` passes.

## Confirmation — no live behavior changed
- `quotes.service.ts` **byte-for-byte unchanged**; `calculateCreateOrUpdateQuoteItemServiceCost`
  / `recalculateQuoteTotals` untouched.
- The compare method performs **reads only** (the test's fake Prisma exposes only
  `findMany`/`findFirst`/`findUnique` — any write would throw). No rate/quote mutation.
- Flag default OFF; no supplier/method selection, no package application (`notApplied:true`),
  no automatic cheapest selection, no UI, no schema/migration/DB write, no `DAILY_PACKAGE`,
  no overnight/stationary charging.

## Files
| File | Change |
|---|---|
| `apps/api/src/transport-pricing/transport-feature-flags.ts` | + `transport.packagePricingShadowCompare` (default OFF) |
| `apps/api/src/transport-pricing/package-eligibility-shadow.service.ts` | + read-only `evaluateQuotePackagePricingShadow` |
| `apps/api/src/transport-pricing/transport-pricing.controller.ts` | + flag-gated debug GET endpoint |
| `apps/api/src/transport-pricing/package-eligibility-shadow.service.test.ts` | + 7 PR 9 tests |
| `docs/transport-pr9-pricing-shadow-compare-plan-2026-06-13.md` + this | docs |

## Rollback
Flag OFF disables the endpoint (instant). No schema/data → reverting the PR removes the
endpoint/method/flag cleanly; live pricing was never touched.
