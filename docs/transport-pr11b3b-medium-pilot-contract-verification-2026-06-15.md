# PR 11B-3B — Alpha Medium Bus USD pilot package contract: Verification

**Date:** 2026-06-15
**Branch:** `transport-pr11b3b-medium-pilot-contract` (from `origin/main`)
**Scope:** create EXACTLY ONE `PACKAGE_MIN_FULL_DAY` contract (Alpha Medium Bus USD) for shadow
validation. **Not live-applied** — live apply remains pinned to the Large 49 pilot; no allowlist
change. No rate rows attached. No schema/migration.

## Created contract
- **id:** `eabd43a0-2374-49d7-aaba-959df4d7c8bd`
- supplier Alpha Bus and Limo Co `3f63311b-021f-432a-8ff8-fc5d5f407ad0` · `Medium Bus` · USD
- `regime PACKAGE_MIN_FULL_DAY` · `minimumFullDays 3` · `minimumDayPolicy INELIGIBLE_UNDER_MIN`
- `fullDayRate 525` · `halfDayRate 307` · `airportTransferIncluded false` · `active true`
- validity 2026-04-01 .. 2026-12-31
- notes: `PILOT — shadow only — Alpha Medium 30 only, not Large VVIP 29 live pricing`
- **rate rows attached: 0** (vehicleRates + transportPricingRules + touringRoutePricings = 0)

**Intended future allowed vehicle** (NOT written to the contract; for PR 11B-3C allowlist):
Medium 30 `da68f987-ce15-469a-8a65-50c2ee2bbca3`.

## Preflight (all passed before the single write)
1. `prisma migrate status` → 189 migrations, **"Database schema is up to date!"**
2. Recovery point: 1 PACKAGE contract before (the Large Bus pilot); 0 existing Alpha Medium Bus USD
   PACKAGE contracts.
3. Dry-run (`--dry-run`) → RATE CHECK `{dailyFullDay:525, halfDay:307}` matches approved; would
   create exactly 1.
4. Rate confirmation: Medium 30 USD DAILY_FULL_DAY = **525**, HALF_DAY = **307** (script aborts if
   these drift).
5. VIP separation: the allowed vehicle resolves to "Medium 30" (script aborts if it were a VIP/VVIP
   name); **Large VVIP 29 (1069/674) is a separate vehicle, not referenced** by this contract.
6. Idempotency: `findMany` matched 0 → created exactly 1 (re-running now matches 1 → no-op).

## Post-creation verification
- **Total PACKAGE contracts = 2:** Alpha Large Bus USD pilot (`66f5de06-…`, 656/370) + Alpha
  Medium Bus USD pilot (`eabd43a0-…`, 525/307).
- New Medium contract: **0 rate rows**, `active = true`, currency USD, values match approved.
- **No code changed** — the only `apps/api` working-tree diff is the excluded
  `proposal-v3-pdf-export.test.ts`. The live-apply pin
  (`PILOT_PACKAGE_CONTRACT_ID = '66f5de06-…'`) and `PACKAGE_VEHICLE_ALLOWLIST` (only Large 49) are
  **unchanged** → the Medium contract is **not** live-applied.
- Production live-apply flag `transport.packagePricingLiveApply` remains **OFF**.

## Confirmations
- This contract **does not apply live**: live apply is still pinned to the single Large 49 pilot id,
  and `PACKAGE_VEHICLE_ALLOWLIST` does not include the Medium contract. Generalizing the pin +
  adding the Medium → Medium 30 allowlist entry is **PR 11B-3C** (not done here).
- No quote/pricing behavior changed; no quote/QuoteItem mutation; no DAILY_PACKAGE/overnight/
  stationary; no schema/migration; no rate rows added.

## Rollback
Set the new contract `active = false` (or delete it — it has 0 dependents). No schema/data
dependency; live pricing never reads it (not allowlisted, pin unchanged).

## Files (PR 11B-3B)
- `scripts/create-medium-package-contract.cjs` (idempotent creation script)
- `docs/transport-pr11b3b-medium-pilot-contract-verification-2026-06-15.md` (this)

## Out of scope (unchanged)
No allowlist/pin generalization (PR 11B-3C); no validation (PR 11B-3D); no PR 12/13; no production
activation; quote-WIP stash + dana untouched; `proposal-v3-pdf-export.test.ts` excluded.
