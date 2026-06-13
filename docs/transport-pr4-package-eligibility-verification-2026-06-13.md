# PR 4 — Package Eligibility Evaluator: Verification (SHADOW / PURE)

**Date:** 2026-06-13
**Branch:** `transport-contract-regime-pr4` (from current `origin/main`)
**Module:** `apps/api/src/transport-pricing/package-eligibility.ts` (pure, **imported nowhere by live code**)

PR 4 adds a pure evaluator that answers one question: *given a `PACKAGE_MIN_FULL_DAY`
contract candidate and PR 3-classified transport days, is the package option eligible,
ineligible, or manually blocked?* It does **not** price, enforce minimums in live pricing,
select suppliers/methods, charge overnight, or activate `DAILY_PACKAGE`.

## API
- `evaluatePackageEligibility(classified, contract | null)` — core, pure.
- `evaluatePackageEligibilityForDays(days, contract | null)` — classifies (PR 3) then evaluates.
- Verdict shape: `{ eligible, reason, countedFullPackageDays, minimumFullDays,
  minimumDayPolicy, billedAtMinimum, billedDays, manualRequiredDays }`.

## Decision logic
1. No contract → `{ eligible:false, reason:'no-package-contract' }`.
2. `countedFullPackageDays >= minimumFullDays` → `eligible`, `billedDays = counted`.
3. Below minimum + `INELIGIBLE_UNDER_MIN` (default) → `{ eligible:false, reason:'below-minimum' }`.
4. Below minimum + `CHARGE_MINIMUM_DAYS` → `eligible`, `billedAtMinimum:true`, `billedDays = minimumFullDays`.
   *(reported only — no live pricing in PR 4.)*

`countedFullPackageDays` comes entirely from PR 3 classification (retained P2P = 1,
released/lone = 0, retention-candidate = 0 + counted in `manualRequiredDays`, touring/
full-day = 1, airport = 0 unless included/reclassified, half-day = 0 / 0.5 / 1 per policy,
stationary = 0 unless `stationaryCountsTowardMinDays`, free = 0).

## Sample eligibility outputs (verified by tests)
| Scenario | counted | eligible | reason | billedAtMinimum / billedDays | manualRequiredDays |
|---|---|---|---|---|---|
| No PACKAGE contract (1 touring) | 1 | **false** | `no-package-contract` | false / null | 0 |
| 3 retained P2P, min 3 | 3 | **true** | — | false / 3 | 0 |
| 2 touring days, min 3 (default) | 2 | **false** | `below-minimum` | false / null | 0 |
| 2 touring days, min 3, `CHARGE_MINIMUM_DAYS` | 2 | **true** | — | **true / 3** | 0 |
| 3 same-vehicle P2P, no release signal, min 3 | 0 | **false** | `below-minimum` | false / null | **3** |
| 3 airport-only, min 3 | 0 | **false** | `below-minimum` | false / null | 0 |
| 3 half-days, min 3 (default) | 0 | **false** | `below-minimum` | false / null | 0 |
| 4 half-days, min 3, `halfDayCountsTowardMin` | 2 | false | `below-minimum` | false / null | 0 |
| 3 stationary, min 3, `stationaryCountsTowardMinDays` | 3 | **true** | — | false / 3 | 0 |

## Tests
`apps/api/src/transport-pricing/package-eligibility.test.ts` — **13 tests, all passing**
(`node --test --require ts-node/register`). `nest build` passes (the `.test.ts` compiles —
no Railway-image risk).

## Confirmation — no behavior changed
- **Imported nowhere by live quote/pricing code** (verified by grep — the only reference is
  a comment in the PR 3 classifier; no live import). The pricing path
  (`calculateCreateOrUpdateQuoteItemServiceCost`) is untouched, so quote totals, supplier
  selection, and pricing method are unaffected.
- No schema, DB, migration, DTO, or quote-builder UI change.
- No `DAILY_PACKAGE` activation, no `PACKAGE_MIN_FULL_DAY` contracts, no minimum-day
  enforcement in live pricing, no driver-overnight charging, **no runtime hook** in
  `transport-pricing.service.ts`.
- Inert by construction AND by data: zero `PACKAGE_MIN_FULL_DAY` contracts exist, so even
  if wired later the evaluator returns `no-package-contract` until a pilot contract is
  created (a future, separately-approved PR).

## Not in scope
PR 5+: optional read-only shadow hook in `transport-pricing.service.ts`; per-day retention
data capture; pilot `PACKAGE_MIN_FULL_DAY` contract; pricing wiring; retiring the old
`excursionPackageRate`/`FULL_DAY` mechanism. The `touring_route_days` schema drift remains
a separate follow-up.
