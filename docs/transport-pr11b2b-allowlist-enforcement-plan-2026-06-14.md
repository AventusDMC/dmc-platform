# PR 11B-2B — Enforce the vehicle-aware allowlist in live apply (PLAN ONLY)

**Date:** 2026-06-14
**Status:** PLAN ONLY — no code/schema/migration/DB/flag/contract changes.
**Builds on:** PR 11B-2A (allowlist diagnostics in shadow) + PR 11A (live apply, flag default OFF,
pinned to pilot `66f5de06-28df-426c-90b8-ffaa01ed5c5f`).
**Goal:** make `computeQuotePackageLiveApply` consult the SAME `computePackageAllowlistDecision`
already used by the shadow, so VIP/Grand-Star/mixed/missing-vehicle cases can no longer apply. Stays
pinned to the pilot; no expansion; flag stays OFF.

## 1. Enforcement logic
- **Reuse the existing pure helper** `computePackageAllowlistDecision(...)` (shipped in 11B-2A) — no
  new decision logic, guaranteeing live apply and shadow agree.
- **Where:** inside `computeQuotePackageLiveApply`, AFTER the existing PR 11A gates (pilot-id pin,
  slab, excursionPackageRate overlap, contract active/regime/USD, supplier+class match, eligibility,
  manual-required, stationary/standby, ADD_ON) and AFTER the counted-day loop, but **BEFORE the cost/
  sell delta is computed**. Flow:
  1. Extend the method's day query to also select `appliedVehicleRate.vehicle.{id,name}` and
     `touringRoutePricing.vehicle.{id,name}` (same fields 11B-2A added to the shadow query).
  2. In the existing counted-day loop (where `packageDayWeight > 0` accumulates countedCost/Sell),
     also collect `countedVehicles[] = { vehicleId, vehicleName, supplierId }` per counted transport
     line (vehicleId from `appliedVehicleRate.vehicle.id ?? quoteService.vehicleId ??
     touringRoutePricing.vehicle.id`).
  3. Call `const decision = computePackageAllowlistDecision({ contractId: contract.id,
     contractCurrency: contract.currency, quoteCurrency: quote.quoteCurrency, countedVehicles })`.
  4. **If `!decision.allowed` → `return block(decision.reason)`** (existing `block()` returns
     `{apply:false, reason, costDelta:0, sellDelta:0}`). No delta computed → no apply.
- **Block reasons returned** (from the helper, surfaced verbatim by live apply):
  `vehicle-not-allowlisted`, `vip-or-grand-star-not-allowed`, `mixed-vehicles`, `missing-vehicle-id`,
  `mixed-suppliers`, `cross-currency`, `not-allowlisted-contract`. (Several overlap with existing PR
  11A gates — e.g. cross-currency / pilot-pin already block earlier with their own reasons; the
  allowlist is the **authoritative vehicle-level** gate and adds vehicle + mixed-supplier enforcement.)

## 2. Behavior guarantees
- **Allowed Large 49 + valid pilot selection (flag ON) → still applies** (countedVehicles all
  `6d575442-…` → `decision.allowed = true`; deltas computed exactly as PR 11A).
- **VIP 31‑33 / Grand Star + pilot contract → blocked** (`vehicle-not-allowlisted` +
  `vip-or-grand-star-not-allowed`) → no apply, existing pricing.
- **Missing/ambiguous vehicle id → blocked** (`missing-vehicle-id`).
- **Mixed vehicles / mixed suppliers / cross-currency → blocked** (respective reasons).
- **Flag OFF → exact baseline** — `computeQuotePackageLiveApply` is only invoked when the flag is
  ON; OFF path unchanged (no allowlist call, no delta).
- **No QuoteItem mutation** — enforcement only changes whether a total-level delta is returned;
  still no item writes (the recalc hook is unchanged).

## 3. Tests (for the implementation)
Against `computeQuotePackageLiveApply` (extend `package-eligibility-shadow.service.test.ts`):
- flag OFF (caller-gated) = no change — covered by the existing `quote-package-live-apply.test.ts`
  wiring tests (unchanged).
- **allowed Large 49** (counted vehicles `6d575442-…`) → `apply:true`, deltas as PR 11A.
- **VIP 31‑33** (counted vehicles `49c5fd5d-…`, pilot selection) → `apply:false`, reason
  `vehicle-not-allowlisted`.
- **Grand Star** (`94c1a79b-…`) → `apply:false`, reason `vehicle-not-allowlisted`.
- **mixed vehicles** (Large 49 + VIP across counted days) → `apply:false` `mixed-vehicles`.
- **missing vehicle id** (a counted line with null vehicle) → `apply:false` `missing-vehicle-id`.
- **non-allowlisted contract** → already blocked by the pilot pin (`not-pilot-contract`); add a case
  asserting the allowlist also rejects a non-allowlisted contract id if reached.
- **cross-currency** → blocked (existing `cross-currency` gate; allowlist agrees).
- **no QuoteItem mutation** — assert no item writes for the apply + block paths.
- **PR 11A Scenario A/B parity for Large 49** — the existing PR 11A live-apply tests (DAILY_FULL_DAY
  + retained P2P, both Large 49) must still return `apply:true` with the same deltas (0 and −2094);
  add vehicle ids to those fixtures so the allowlist passes. Regression-assert the full PR 11A set.

> Note: the existing PR 11A live-apply tests build counted days WITHOUT vehicle ids (the fixtures
> set `vehicleId`/class but the allowlist needs the rate vehicle id). When enforcement is added,
> those fixtures must include `appliedVehicleRate.vehicle.id = 6d575442-…` so they keep passing —
> otherwise they'd newly fail `missing-vehicle-id`. This fixture update is part of 11B-2B.

## 4. Rollback
- **Flag OFF** (`transport.packagePricingLiveApply`) → live apply never runs → baseline restored on
  next recompute (unchanged from PR 11A).
- **Remove a vehicle from `PACKAGE_VEHICLE_ALLOWLIST`** (code edit) → that vehicle's quotes stop
  applying; no data change, no migration.
- **No schema rollback** (in-code allowlist; no DB).

## 5. File list
- `apps/api/src/transport-pricing/package-eligibility-shadow.service.ts` — extend
  `computeQuotePackageLiveApply` day query (vehicle id+name) + collect `countedVehicles` + call
  `computePackageAllowlistDecision` + block on failure. **No change to the shadow method or the
  helper.**
- `apps/api/src/transport-pricing/package-eligibility-shadow.service.test.ts` — enforcement tests +
  PR 11A fixture vehicle-id updates.
- `docs/transport-pr11b2b-allowlist-enforcement-verification-*.md` — verification.
- **`quotes.service.ts` remains UNTOUCHED** — confirmed: the recalc hook calls
  `computeQuotePackageLiveApply` and applies whatever delta it returns; a blocked decision returns
  delta 0 → no apply. No change needed there. (Will assert empty diff vs origin/main.)
- **No schema/migration.**

## 6. Risks
- **Accidentally blocking valid Large 49** — mitigated by reusing the proven helper + the PR 11A
  Scenario A/B parity regression (must still apply). Primary acceptance gate.
- **Accidentally allowing VIP** — the allowlist is a closed set (`6d575442-…` only); explicit tests
  for VIP/Grand Star → blocked.
- **Allowlist relying on missing vehicle ids** — resolve from rate vehicle id with fallbacks; if
  unresolved → `missing-vehicle-id` block (fail-closed, never guess/apply).
- **Changing shadow output unintentionally** — 11B-2B touches only `computeQuotePackageLiveApply`;
  the shadow method + its `allowlist` block are untouched (regression test asserts shadow unchanged).
- **Live apply diverging from shadow** — eliminated by both calling the SAME
  `computePackageAllowlistDecision` with the same counted-vehicle resolution.

## 7. Acceptance criteria
- Flag OFF → zero change (PR 11A wiring tests pass unchanged).
- Flag ON: Large 49 pilot quote applies with identical deltas (Scenario A delta 0, Scenario B
  −2094); VIP/Grand Star/mixed/missing/mixed-supplier/cross-currency/non-allowlisted → no apply with
  the correct block reason.
- **No QuoteItem mutation; no quote total change except the already-validated Large 49 apply.**
- Shadow output unchanged; `quotes.service.ts` untouched; no schema/migration/DB/flag/contract change.
- Live apply and shadow allowlist decisions agree (same helper).
- All existing + new tests green; `nest build` passes.

## Strictly not in this step
No implementation; no schema/migration/DB/contract; no supplier/class expansion (still pilot-pinned);
no production flag activation; no overnight/stationary/DAILY_PACKAGE; no PR 11B-3 / PR 12 / PR 13; no
quote-WIP stash; no dana; `proposal-v3-pdf-export.test.ts` excluded.
