# PR 11B-3C — Closed contract+vehicle allowlist: Verification

**Date:** 2026-06-15
**Branch:** `transport-pr11b3c-contract-allowlist` (from `origin/main`)
**Scope:** generalize live apply from the single hard-coded pilot pin to a **closed contract
allowlist** (the keys of `PACKAGE_VEHICLE_ALLOWLIST`), adding the Alpha Medium Bus / Medium 30 pilot.
Flag stays OFF; no schema/DB/contract change; `quotes.service.ts` untouched.

## What changed (`package-eligibility-shadow.service.ts` only)
- `PACKAGE_VEHICLE_ALLOWLIST` now has **two** entries:
  - `66f5de06-28df-426c-90b8-ffaa01ed5c5f` → `6d575442-05fd-4cf6-bd22-5e8a0ee12303` (Large Bus → Large 49)
  - `eabd43a0-2374-49d7-aaba-959df4d7c8bd` → `da68f987-ce15-469a-8a65-50c2ee2bbca3` (Medium Bus → Medium 30)
- `computeQuotePackageLiveApply` gate **replaced**: the single-id pin
  (`!== PILOT_PACKAGE_CONTRACT_ID` → `not-pilot-contract`) is now
  `if (selectedContractId not a key of PACKAGE_VEHICLE_ALLOWLIST) block('not-allowlisted-contract')`.
  The per-contract vehicle gate continues via the shared `computePackageAllowlistDecision`.
- `PILOT_PACKAGE_CONTRACT_ID` retained as a documented reference only (no longer the gate).
- Shadow method + the helper are **unchanged** — adding the map entry makes the shadow report
  correctly for the Medium contract too (shadow + live share one map + one decision).

## Behavior
- **Flag OFF:** exact baseline (method not invoked).
- **Flag ON:** applies only if the selected contract id is an allowlist key AND all counted-day
  vehicles ∈ that contract's allowed list AND all PR 11A/11B gates pass.
- Closed set: only the two pilot contract→vehicle combinations apply; everything else blocked.

## Tests (77 pass; +6 PR11B-3C, 1 updated)
- **Large 49 + Large contract → applies** (parity).
- **Medium 30 + Medium contract → applies** (`costDelta -918.75` = 1181.25 net − 2100; new).
- **Medium 30 + Large contract → blocked** `supplier-class-mismatch`.
- **Large 49 + Medium contract → blocked** `supplier-class-mismatch`.
- **Large VVIP 29 + Medium contract → blocked** `vehicle-not-allowlisted`.
- **Unlisted contract → blocked** `not-allowlisted-contract` (updated from `not-pilot-contract`).
- VIP / Grand Star / mixed-vehicles / missing-vehicle-id / mixed-suppliers / cross-currency → blocked
  (existing PR11B-2B tests still green).
- **Shadow:** Medium 30 → `allowlist.allowed = true` (Medium contract, allowedVehicleIds = [Medium 30]);
  Large VVIP 29 → `allowed = false` (`vehicle-not-allowlisted`).
- Flag OFF baseline + no QuoteItem mutation (wiring tests unchanged).
- `nest build` passes.

## Real-quote parity (READ-ONLY — no writes)
`computeQuotePackageLiveApply` on the validated Large Bus test quotes under the new contract gate:
- Scenario A `04f87127-…`: `apply=true, costDelta=0, sellDelta=0` ✓
- Scenario B `714ac0d8-…`: `apply=true, costDelta=-2094, sellDelta=-2094` ✓
Large 49 behavior unchanged (still passes — Large contract id is an allowlist key).

## Confirmations
- **Large 49 behavior unchanged** (parity 0 / −2094).
- **Medium 30 now supported** by the closed allowlist (applies flag-ON + valid selection).
- **Large VVIP 29 blocked** (`vehicle-not-allowlisted`).
- **Shadow and live apply share the same allowlist decision** (one helper, one map).
- **Production live-apply flag remains OFF**; no schema/migration/DB write/new contract/quote
  mutation; `quotes.service.ts` untouched.

## Rollback
Flag OFF → no apply. Remove the Medium entry (or any) from `PACKAGE_VEHICLE_ALLOWLIST` (code) →
that contract/vehicle stops applying; no data/schema change.

## Files
- `apps/api/src/transport-pricing/package-eligibility-shadow.service.ts`
- `apps/api/src/transport-pricing/package-eligibility-shadow.service.test.ts`
- `docs/transport-pr11b3c-contract-allowlist-plan-2026-06-15.md` + this verification

## Out of scope (unchanged)
No production activation; no PR 11B-3D validation; no PR 12/13; quote-WIP stash + dana untouched;
`proposal-v3-pdf-export.test.ts` excluded.
