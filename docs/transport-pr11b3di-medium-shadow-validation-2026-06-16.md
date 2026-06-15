# PR 11B-3D-i — Alpha Medium Bus / Medium 30 test quotes + shadow validation

**Date:** 2026-06-16
**Scope:** built the two throwaway Medium 30 test quotes and ran **shadow validation with the
live-apply flag OFF**. No flag-ON (that is 11B-3D-ii). Contract
`eabd43a0-2374-49d7-aaba-959df4d7c8bd`; allowed vehicle Medium 30
`da68f987-ce15-469a-8a65-50c2ee2bbca3`.

## Test quotes created (DRAFT / TEST, USD)
- **Scenario A:** `84ba04f5-0127-4f13-8ac2-07d2b2cc7503` — `TEST — Alpha Medium Bus Package Pilot — DO NOT USE` (5 days / 5 items)
- **Scenario B:** `caf51d18-c8d9-45cf-932a-6251d5e8540c` — `TEST — Alpha Medium Bus Package Pilot P2P — DO NOT USE` (5 days / 5 items)

All transport items resolve to **Medium 30** `da68f987-…` (NOT Large VVIP 29; the build asserted
this per item and would have aborted otherwise).

> Build note: transport **item pricing** was created via the real engine (`QuotesService.createItem`)
> — costs are engine-correct. The **day rows / day-item links / day metadata** were created via plain
> `prisma` because Railway was reproducibly dropping the interactive `$transaction` inside the
> audit-logged `QuoteItineraryService.createDay` ("Transaction not found … obtained before
> disconnecting"). This is structural only (no pricing) and the shadow reads the identical
> structures. No service/pricing code was changed.

## Scenario A — deterministic (shadow, flag OFF)
`{ packageContractId: eabd43a0-…, packageEligible: true, countedFullPackageDays: 3,
manualRequiredDays: 0, currentTransportTotal: 1641.75, packageGrossTotal: 2035.5,
supplierDiscountPercent: 25, supplierDiscountAmount: 393.75, packageNetTotal: 1641.75,
difference: 0, excludedDays: [D1 airport 230.25, D5 airport 230.25],
allowlist: { allowed: true, reason: allowed, resolvedVehicleIds: [da68f987-…],
allowedVehicleIds: [da68f987-…], vehicleNames: [Medium 30], blockers: [] }, notApplied: true }`
- Counted (3 full days) = 3×393.75 = **1181.25**; package net days = **1181.25** → **delta 0** (package
  == discounted daily card). Matches approved expectation.
- Saved PACKAGE selection → `selectionStale = false`, `notApplied = true`.
- Persisted totals before/after recompute (flag OFF): **1641.75 / 1641.75 — unchanged**.

## Scenario B — retained P2P, Aqaba fixed-base (shadow, flag OFF)
`{ packageContractId: eabd43a0-…, packageEligible: true, countedFullPackageDays: 3,
manualRequiredDays: 0, currentTransportTotal: 3102.75, packageGrossTotal: 1890,
supplierDiscountPercent: 25, supplierDiscountAmount: 393.75, packageNetTotal: 1496.25,
difference: -1606.5, excludedDays: [D1 airport 157.5, D5 airport 157.5],
allowlist: { allowed: true, … vehicleNames: [Medium 30], blockers: [] }, notApplied: true }`
- counted/replaced = 850.5 + 761.25 + 1176 = **2787.75**; excluded airport = **315**; baseline
  **3102.75**; package gross **1575** → net **1181.25**; **cost delta −1606.5** (= shadow
  difference); sell delta (0% markup) −1606.5; **final if flag ON would be 1496.25 / 1496.25**
  (NOT run — flag OFF). Matches approved math exactly.
- Saved PACKAGE selection → `selectionStale = false`, `notApplied = true`.
- Persisted totals before/after recompute (flag OFF): **3102.75 / 3102.75 — unchanged**.

## Validation confirmations
1. Test quote IDs: A `84ba04f5-…`, B `caf51d18-…`.
2. Both **DRAFT / TEST**.
3. Every transport item = **Alpha Medium 30** (not Large VVIP 29).
4. `package-pricing-shadow` finds contract **`eabd43a0-…`** for both.
5. Allowlist **passes for Medium 30** (`allowed: true`, allowedVehicleIds = [Medium 30]).
6. **Large VVIP 29 not used** anywhere.
7. `packageEligible = true`, `countedFullPackageDays = 3`, `manualRequiredDays = 0`,
   `selectionStale = false` after save, `notApplied = true`.
8. Shadow math matches approved figures (A delta 0; B delta −1606.5).
9. Persisted totals **unchanged** under flag OFF (A 1641.75; B 3102.75).
10. No unrelated files touched (build script deleted; only docs committed; `proposal-v3` excluded).

## Safety
- `TRANSPORT_PACKAGE_PRICING_LIVE_APPLY` **never set** (flag OFF throughout); no production flag.
- No real business quotes touched; **CONFIRMED "Exodus" quote untouched** (status CONFIRMED, no
  selection). Real Medium 30 DRAFT quotes not modified.
- Saved selections are metadata-only while the flag is OFF (no totals applied).
- No new contracts; no schema/migration; no QuoteItem mutation; `quotes.service.ts` untouched;
  quote-WIP stash + dana untouched.

## Next (separate approval)
PR 11B-3D-ii — controlled flag-ON validation on these two test quotes only (2-phase script, flag ON
in-process, recompute, then flag OFF + restore), expecting A 1641.75 (delta 0) and B
3102.75 → 1496.25 → restored to 3102.75. Then PR 12 (overnight/stationary), PR 13 (retire
excursionPackageRate).

## Cleanup / rollback
Clear selection (`{option:null}`), reset day metadata to Auto, archive/delete the two test quotes
when no longer needed. No DB rollback otherwise (DRAFT test quotes; totals at baseline; flag OFF).
