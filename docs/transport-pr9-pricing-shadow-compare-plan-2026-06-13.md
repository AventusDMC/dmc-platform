# PR 9 — Pricing Shadow-Compare (PLAN ONLY)

**Date:** 2026-06-13
**Status:** PLAN ONLY — no code/DB write. For approval.
**Goal:** Compute **route/transfer total vs package candidate total side-by-side** for
diagnostics. **Never applies the package price, never changes a quote total.** This is the
first step toward live package pricing — and it is still entirely shadow + flag-gated.

## 1. Goal
- **Baseline:** current route/transfer transport total = **sum of persisted transport
  `QuoteItem` costs** (read-only).
- **Package candidate:** total under the pilot `PACKAGE_MIN_FULL_DAY` contract when eligible.
- Return **both** + the difference in shadow/debug mode only. No quote total / supplier /
  pricing-method change.

## 2. Safety mode — feature flag, default OFF
- New flag **`transport.packagePricingShadowCompare`** (env
  `TRANSPORT_PACKAGE_PRICING_SHADOW_COMPARE`, default **OFF**), independent of the PR 5
  eligibility flag.
- OFF → comparison does not run (endpoint returns `{ enabled:false }`). ON → comparison
  computed + returned, **never written/applied**.

## 3. Hook location — new debug endpoint (recommended)
- **`GET /transport-pricing/quotes/:id/package-pricing-shadow`** — `@Roles('admin','finance')`
  (global `GlobalAuthGuard` + `RolesGuard`). Gated by the new flag. Keeps the
  pricing-compare concern + flag separate from the PR 5 eligibility endpoint.
- Reuses the PR 5/6 shadow eligibility internally + adds the baseline + package totals.
- **Not** wired into live quote calc. **`calculateCreateOrUpdateQuoteItemServiceCost` and
  quote totals are untouched.**

## 4. Package candidate total — calculation logic (read-only)
1. Run the existing shadow eligibility (PR 4–6) using the **pilot PACKAGE_MIN_FULL_DAY**
   contract for the quote's primary supplier+vehicleClass.
2. If **not eligible** (`no-package-contract`, or `below-minimum` under
   `INELIGIBLE_UNDER_MIN`) → `packageCandidateTotal = null`, `notApplied: true`, reason set.
3. If **eligible**:
   - `fullDayCount` = days with `packageDayWeight === 1`; `halfDayCount` = days with
     `packageDayWeight === 0.5` (only when the contract allows half-day counting).
   - `packageDaysCost = fullDayCount × fullDayRate + halfDayCount × halfDayRate`.
   - **`CHARGE_MINIMUM_DAYS` below min:** bill the floor = `minimumFullDays × fullDayRate`
     (only if the contract says so; default `INELIGIBLE_UNDER_MIN` never charges below min).
   - **Excluded (non-counted) transport days** — airport transfers (separate by default),
     released P2P, manual-required/candidate — keep their **persisted route cost**
     (`excludedDaysRouteCost`), so the two sides cover the same days.
   - `packageCandidateTotal = packageDaysCost + excludedDaysRouteCost`.
4. **Supplier discount parity (decision needed):** the baseline persisted costs are
   **net** of Alpha's `transportDiscountPercent` (25%); the contract `fullDayRate` is gross.
   For apples-to-apples, the shadow should apply the supplier discount to the package rates
   too. *Proposed: apply `transportDiscountPercent` to `fullDayRate`/`halfDayRate` in the
   shadow, and surface it (`supplierDiscountApplied`).* Confirm.
5. **Documented exclusions (PR 9):** standard **Alpha Large 49** rate only (NOT VIP 31-33 —
   warning emitted); **no driver overnight**, **no stationary** charging (stationary may be
   shown as a separate diagnostic line only, never added). Airport separate by default.
   Released / candidate days never auto-count.

## 5. Baseline route/transfer total — safe read
- **Read persisted transport-item costs** (`QuoteItem.finalCost ?? totalCost`, honoring
  `useOverride`) for the quote's transport items. **No re-derivation**, no call into
  `calculateCreateOrUpdateQuoteItemServiceCost`, no `recalculateQuoteTotals` — zero recalc,
  zero write.
- Labelled **`currentTransportTotal` (as persisted)**. If a quote's costs are stale (not
  recently recomputed), the baseline reflects last-saved state — acceptable for a diagnostic
  and clearly labelled. **If, during implementation, the only way to get a baseline would
  require triggering a recompute/write, STOP and report** (we will not mutate quote state).

## 6. Diagnostic output
```
{
  enabled: true,
  quoteId,
  flag: 'transport.packagePricingShadowCompare',
  currentTransportTotal,           // persisted route/transfer baseline
  packageCandidateTotal,           // null when not eligible
  difference,                      // packageCandidateTotal - currentTransportTotal (null if N/A)
  packageEligible,
  packageContractId,               // pilot 66f5de06-… or null
  countedFullPackageDays, fullDayCount, halfDayCount,
  billableDays, billedAtMinimum, manualRequiredDays,
  excludedDays: [{ dayNumber, operationalType, routeCost }],
  supplierDiscountApplied,         // % applied to package rates for parity
  reason,                          // no-package-contract | below-minimum | null
  dayPlan,                         // per-day classification (PR3/6)
  warnings,                        // e.g. "standard Large 49 rate, not VIP 31-33", "excludes overnight/stationary"
  notApplied: true,
}
```

## 7. Test plan
- Flag OFF → `{ enabled:false }`, no comparison.
- Flag ON → comparison returned only; **stored quote total unchanged**; **baseline read uses
  persisted costs (no recalc)** — assert the service makes no write/`$transaction`/cost-calc calls.
- 3 retained days + pilot contract → `packageEligible:true`, a `packageCandidateTotal`.
- Below-minimum (2 days) → `packageCandidateTotal: null`, reason `below-minimum`.
- Manual-required / candidate days do not count (and their cost lands in `excludedDays`).
- Airport-only days → not counted (excluded), package portion 0.
- No PACKAGE contract → reason `no-package-contract`, `packageCandidateTotal: null`.
- Pilot uses **standard Large Bus 49** rate only (warning present; VIP 31-33 not used).

## 8. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Triggering quote recalculation | Baseline = persisted reads only; never call the cost calc / recalc; service is read-only (asserted by fake-prisma without write methods) |
| Stale persisted baseline | Label `currentTransportTotal (as persisted)`; diagnostic only; STOP+report if a fresh baseline would require a write |
| Standard Large 49 vs VIP 31-33 | Warning in output; pilot is explicitly standard; per-vehicle nuance deferred |
| Gross vs net (supplier discount) parity | Apply `transportDiscountPercent` to package rates in shadow + surface it; confirm with you |
| Auto-choosing cheapest | Both totals returned, `notApplied:true`; no selection made |
| Writing shadow results | Read-only; nothing persisted |
| Endpoint over-exposed | `@Roles('admin','finance')` + flag default OFF |

## 9. Acceptance criteria
- No live pricing change · no quote total change · no supplier/method selection change · no
  DB writes (reads only) · no schema/migration · no package-option UI · no `DAILY_PACKAGE` ·
  no overnight/stationary charging · no PR 10 work.
- Flag OFF = inert; flag ON = diagnostics only; `quotes.service.ts` untouched.
- Tests pass; `nest build` passes; PR limited to the listed files.

## File list (when implemented)
| File | Type |
|---|---|
| `apps/api/src/transport-pricing/transport-feature-flags.ts` | add the new flag helper |
| `apps/api/src/transport-pricing/package-eligibility-shadow.service.ts` | add read-only pricing-compare method + persisted-baseline reader |
| `apps/api/src/transport-pricing/transport-pricing.controller.ts` | new flag-gated debug GET endpoint |
| `apps/api/src/transport-pricing/package-eligibility-shadow.service.test.ts` | pricing-compare tests |
| `docs/transport-pr9-pricing-shadow-compare-plan-2026-06-13.md` (this) + verification doc | docs |
*(No `app.module` change — service already registered. No schema/migration/UI/quotes.service.)*

## Open decisions for you
1. **New endpoint** `package-pricing-shadow` (recommended) vs extending the eligibility endpoint.
2. **Supplier-discount parity:** apply Alpha's 25% to the package rates in the shadow
   (recommended, matches the net baseline) — confirm.
3. **Stationary in PR 9:** exclude entirely (recommended) vs show as a separate diagnostic
   line (never added to the total).
