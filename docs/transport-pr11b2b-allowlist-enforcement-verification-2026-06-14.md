# PR 11B-2B — Vehicle-aware allowlist ENFORCEMENT: Verification

**Date:** 2026-06-14
**Branch:** `transport-pr11b2b-allowlist-enforcement` (from `origin/main`)
**Scope:** `computeQuotePackageLiveApply` now enforces the same `computePackageAllowlistDecision`
the shadow already surfaces. Safety hardening — still pilot-pinned, flag default OFF, no expansion.

## What changed
- `package-eligibility-shadow.service.ts` — **`computeQuotePackageLiveApply` only**:
  - day query extended to select `appliedVehicleRate.vehicle.{id,name}` +
    `touringRoutePricing.vehicle.{id,name}`;
  - `dayTransport` now also collects per-line `{ vehicleId, vehicleName, supplierId }`;
  - after the counted-day loop (and `no-counted-cost` check) and **before** computing the delta, it
    builds `countedVehicles` and calls **the same** `computePackageAllowlistDecision`; if
    `!allowed` → `return block(decision.reason)`.
  - The shadow method (`evaluateQuotePackagePricingShadow`) and the helper are **unchanged**.
- `package-eligibility-shadow.service.test.ts` — +6 enforcement tests; PR 11A apply fixtures
  (`liveQS`) updated to carry the allow-listed Large 49 vehicle id so they keep applying.
- `quotes.service.ts` — **untouched** (verified empty diff vs origin/main). The recalc hook applies
  whatever delta the method returns; a blocked decision returns delta 0 → no apply.

**Pilot pin** `66f5de06-28df-426c-90b8-ffaa01ed5c5f`; **allowed vehicle**
`6d575442-05fd-4cf6-bd22-5e8a0ee12303` (Alpha "Large 49") — unchanged.

## Block reasons now enforced in live apply
`vehicle-not-allowlisted` · `vip-or-grand-star-not-allowed` (companion blocker) · `mixed-vehicles` ·
`missing-vehicle-id` · `mixed-suppliers` · `cross-currency` · `not-allowlisted-contract`. (Note:
`not-allowlisted-contract` and `cross-currency` are also caught earlier by the PR 11A pilot-pin /
USD gates — the allowlist is the authoritative **vehicle-level** + **mixed-supplier** gate.)

## Tests (71 pass; +6 PR11B-2B)
- allowed Large 49 → `apply:true`, costDelta −624 (unit fixture).
- VIP 31‑33 (same Large Bus class) → `apply:false` `vehicle-not-allowlisted`.
- Grand Star → `apply:false` `vehicle-not-allowlisted`.
- mixed vehicles (Large 49 + VIP) → `apply:false` `mixed-vehicles`.
- missing vehicle id → `apply:false` `missing-vehicle-id`.
- mixed suppliers → `apply:false` `mixed-suppliers`.
- Full PR 11A live-apply set + PR 11B-2A diagnostics + PR9/PR10B-2 all still green (parity).
- `quote-package-live-apply.test.ts` wiring tests still pass (flag OFF baseline; no item mutation).
- `nest build` passes.

## Real-quote parity (READ-ONLY — `computeQuotePackageLiveApply` does no writes)
Calling the updated method directly on the two validated test quotes (vehicle = Large 49):
- **Scenario A** `04f87127-…`: `apply=true, reason=null, costDelta=0, sellDelta=0, contractId=66f5de06-…` ✓
- **Scenario B** `714ac0d8-…`: `apply=true, reason=null, costDelta=-2094, sellDelta=-2094, contractId=66f5de06-…` ✓
Both pass the new vehicle gate and produce the **same deltas validated in PR 11A** (0 and −2094).

## Confirmations
- **Allowed Large 49 still applies** (unit + real-quote read).
- **VIP 31‑33 / Grand Star blocked** even though they share `vehicleClass = Large Bus` (the gap the
  PR 11A supplier+class gate left open is now closed).
- **Scenario A/B match the validated PR 11A results** (0 / −2094).
- **`quotes.service.ts` untouched**; shadow output unchanged (same helper, shadow method untouched).
- **No schema / migration / DB write / flag change / QuoteItem mutation** — enforcement only decides
  whether a total-level delta is returned. Live-apply flag `transport.packagePricingLiveApply`
  remains OFF (default).
- Live apply and shadow use the **same** `computePackageAllowlistDecision` → cannot diverge.

## Rollback
Flag OFF → no apply (baseline). Remove a vehicle from `PACKAGE_VEHICLE_ALLOWLIST` (code) → that
vehicle stops applying; no data/schema change.

## Out of scope (unchanged)
No supplier/class expansion; no new contracts (PR 11B-3); no PR 12/13; no production activation;
quote-WIP stash + dana untouched; `proposal-v3-pdf-export.test.ts` excluded.
