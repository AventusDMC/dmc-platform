# PR 11B-3C — Generalize live apply to a closed contract+vehicle allowlist (PLAN ONLY)

**Date:** 2026-06-15
**Status:** PLAN ONLY — no code/schema/migration/DB/flag/quote/contract changes.
**Goal:** replace the single hard-coded `PILOT_PACKAGE_CONTRACT_ID` gate in
`computeQuotePackageLiveApply` with a **closed contract allowlist**, adding the Alpha Medium Bus /
Medium 30 pilot alongside the existing Large Bus / Large 49 pilot. Flag stays OFF; no validation
(11B-3D) yet.

## Current state (verified)
- `PACKAGE_VEHICLE_ALLOWLIST` already exists (one map, shared by shadow + live):
  `{ '66f5de06-…': ['6d575442-…'] }` (Large Bus contract → Large 49).
- `computeQuotePackageLiveApply` gates on a **single id**:
  `if (selectedTransportContractId !== PILOT_PACKAGE_CONTRACT_ID) block('not-pilot-contract')` — this
  blocks the Medium contract today.
- The shadow + the 11B-2B enforcement both call the same `computePackageAllowlistDecision(...)`,
  which already returns `not-allowlisted-contract` for any contract id not in the map, plus the
  vehicle/mixed/missing/cross-currency reasons.

## 1. Contract allowlist model
- The **keys of `PACKAGE_VEHICLE_ALLOWLIST` are the closed contract allowlist** (single source of
  truth). Add the Medium entry so the map becomes:
  ```
  '66f5de06-28df-426c-90b8-ffaa01ed5c5f': ['6d575442-05fd-4cf6-bd22-5e8a0ee12303'], // Large Bus → Large 49
  'eabd43a0-2374-49d7-aaba-959df4d7c8bd': ['da68f987-ce15-469a-8a65-50c2ee2bbca3'], // Medium Bus → Medium 30
  ```
- **Replace the single-id pin** in `computeQuotePackageLiveApply` with an early closed-allowlist
  check: `if (!Object.prototype.hasOwnProperty.call(PACKAGE_VEHICLE_ALLOWLIST, selectedTransportContractId))
  return block('not-allowlisted-contract')`. (The `PILOT_PACKAGE_CONTRACT_ID` const is no longer the
  gate — remove it, or retain only as a comment; the map is authoritative.)
- **No supplier+vehicleClass broad matching** — a contract is allowed ONLY if its id is a map key.
  Supplier+class match remains a *necessary* gate (existing), never sufficient.

## 2. Vehicle allowlist model
- Per-contract allowed vehicles (the map values):
  - Large Bus `66f5de06-…` → **Large 49** `6d575442-…` only.
  - Medium Bus `eabd43a0-…` → **Medium 30** `da68f987-ce15-469a-8a65-50c2ee2bbca3` only.
- **Large VVIP 29** (`ac827384-…`, 1069/674) shares `vehicleClass = Medium Bus` but is **not** in the
  Medium contract's allowed list → blocked (`vehicle-not-allowlisted` + `vip-or-grand-star-not-allowed`).
- All VIP/VVIP/Grand Star variants remain blocked unless explicitly allowlisted (they aren't).

## 3. Live apply behavior
- **Flag OFF:** exact existing behavior; `computeQuotePackageLiveApply` not invoked; no totals change.
- **Flag ON:** a saved PACKAGE selection applies **only if**:
  - `selectedTransportContractId` is a key in `PACKAGE_VEHICLE_ALLOWLIST` (closed contract allowlist), AND
  - all counted-day vehicle ids ∈ that contract's allowed vehicle list (existing 11B-2B gate via the
    shared helper), AND
  - every existing PR 11A/11B safety gate passes (active/regime/USD, supplier+class match, eligible,
    no manual-required, no stationary/standby, no ADD_ON, no overlap, not slab, day-membership).
- No automatic cheapest selection; manual selection still required; **no QuoteItem mutation** (delta
  at total-assembly only).

## 4. Shadow behavior
- **No shadow code change needed** — the shadow already computes the `allowlist` block via the same
  `computePackageAllowlistDecision` against the resolved/selected contract id. Adding the Medium map
  entry makes the shadow report `allowed` for Medium 30 quotes under the Medium contract and `blocked`
  (`vehicle-not-allowlisted`) for VVIP 29. Shadow + live use the **same helper** → cannot diverge.
- Shadow `allowlist` block still exposes: `allowed`, `reason`, `resolvedVehicleIds`,
  `allowedVehicleIds`, `vehicleNames`, `blockers` — now meaningful for both contracts.

## 5. Validation / matching (how each case is detected)
Counted-day vehicle ids resolved from `appliedVehicleRate.vehicle.id` (fallback scalar /
touringRoutePricing) over `packageDayWeight > 0` days; supplier ids + currency likewise:
- **Medium 30 quote** → primary `{Alpha, Medium Bus}` → resolves Medium contract; vehicle Medium 30 ∈
  allowed → applies.
- **Large VVIP 29 quote** (class Medium Bus) → passes supplier+class for the Medium contract, then
  `vehicle-not-allowlisted` (VVIP not in [Medium 30]).
- **Mixed Medium 30 + VVIP** → `mixed-vehicles` (two distinct counted vehicle ids).
- **Missing vehicle id** → `missing-vehicle-id` (fail-closed).
- **Mixed suppliers** → `mixed-suppliers`.
- **Mixed currency / non-USD** → `cross-currency`.
- **Wrong contract for vehicle** (e.g. Medium 30 quote with the Large contract selected) → the
  Large contract is `vehicleClass = Large Bus` ≠ primary `Medium Bus` → **`supplier-class-mismatch`**
  (caught before the allowlist); and vice-versa. The allowlist additionally catches same-class
  wrong-vehicle. Two independent layers.

## 6. Tests (for the implementation)
- **Large 49 + Large contract → applies** (parity; deltas unchanged).
- **Medium 30 + Medium contract → applies** (new).
- **Medium 30 + Large contract → blocked** (`supplier-class-mismatch`).
- **Large 49 + Medium contract → blocked** (`supplier-class-mismatch`).
- **Large VVIP 29 + Medium contract → blocked** (`vehicle-not-allowlisted`).
- **VIP / VVIP / Grand Star → blocked**.
- **Unlisted contract → blocked** (`not-allowlisted-contract`).
- **Missing vehicle id → blocked**; **mixed vehicles → blocked**; **mixed suppliers → blocked**;
  **cross-currency → blocked**.
- **Flag OFF → baseline** (wiring tests unchanged).
- **No QuoteItem mutation**.
- **Scenario A/B Large Bus parity** still passes (delta 0 / −2094) — Large 49 unaffected.
- **Shadow:** Medium 30 quote → `allowlist.allowed = true` for the Medium contract; VVIP 29 →
  `allowed = false` (`vehicle-not-allowlisted`). Map now has 2 contract keys (assert).

## 7. File list
- `apps/api/src/transport-pricing/package-eligibility-shadow.service.ts` — add the Medium map entry;
  replace the single-id pin with the closed-allowlist-keys check (remove/retire
  `PILOT_PACKAGE_CONTRACT_ID` as the gate). Shadow method + helper otherwise unchanged.
- `apps/api/src/transport-pricing/package-eligibility-shadow.service.test.ts` — §6 tests.
- `docs/transport-pr11b3c-contract-allowlist-verification-*.md` — verification.
- **`quotes.service.ts` remains UNTOUCHED** (the recalc hook applies whatever delta the method
  returns; unchanged). **No schema/migration.**

## 8. Risks
- **Accidentally broadening to all Alpha Medium Bus** — prevented: contract allowlist is a closed map
  (only the two pilot contract ids); vehicle allowlist is Medium 30 only. Regression test: an Alpha
  Medium Bus quote on a *non-listed* contract / a non-Medium-30 vehicle → blocked.
- **Large VVIP 29 mispriced as Medium 30** — blocked by the vehicle allowlist (explicit test).
- **Wrong contract for vehicle** — class gate + allowlist (two layers; tests).
- **Shadow/live divergence** — eliminated (same `computePackageAllowlistDecision`, same map).
- **Missing vehicle ids** — fail-closed (`missing-vehicle-id`).
- **Stale package selection** — shadow `selectionStale` surfaces it; live apply re-derives
  contract/eligibility each recompute (a deactivated/mismatched contract fails active/class checks).
- **Expansion while flag OFF, future flag-on impact** — this PR makes BOTH contracts *eligible to
  apply when the flag is later turned on*; that is intended, but real activation stays gated by (a)
  the flag (OFF), (b) PR 11B-3D controlled validation, and (c) explicit activation approval. No live
  effect lands from this PR while the flag is OFF.

## 9. Acceptance criteria
- No production flag change; no DB writes; no schema/migration; no new contracts; no quote mutations.
- Live apply still flag-gated (OFF); accepts **only** listed contract + listed vehicle combinations
  (`66f5de06-…`→Large 49, `eabd43a0-…`→Medium 30); everything else blocked with the correct reason.
- Shadow and live apply share the same allowlist decision (one helper, one map).
- Existing Large 49 behavior unchanged (Scenario A/B parity: 0 / −2094).
- Medium 30 support added but only applies when flag ON **and** a valid saved selection passes all
  gates.
- All existing + new tests green; `nest build` passes; `quotes.service.ts` untouched.
- PR 11B-3D validation not started.

## Strictly not in this step
No implementation; no schema/migration/DB/contract; no production flag activation; no PR 11B-3D
validation; no PR 12/13; no quote-WIP stash; no dana; `proposal-v3-pdf-export.test.ts` excluded.
