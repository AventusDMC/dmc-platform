# PR 11A — Pilot test-quote creation plan (Alpha Large 49 USD) — PLAN ONLY

**Date:** 2026-06-14
**Status:** PLAN ONLY. Do NOT create the quote or mutate data until approved.
**Why:** no existing quote uses Alpha **Large Bus**; we need one dedicated throwaway quote to
validate the pilot contract `66f5de06-28df-426c-90b8-ffaa01ed5c5f` (Alpha / Large Bus / USD)
end-to-end, with `TRANSPORT_PACKAGE_PRICING_LIVE_APPLY` **OFF**.

## Verified building blocks (read-only)
- Supplier **Alpha Bus and Limo Co** `3f63311b-021f-432a-8ff8-fc5d5f407ad0`, `transportDiscountPercent = 25`.
- Vehicle **"Large 49"** `6d575442-05fd-4cf6-bd22-5e8a0ee12303` (standard — NOT "Large VIP 31‑33" `49c5fd5d…`).
- Large 49 USD rates: **DAILY_FULL_DAY 656** (`3529a63e-81ec-40f2-b44d-1fc827eea0eb`, FULL_DAY, 1–49 pax) ·
  **AIRPORT_TRANSFER Amman↔QAIA 370** (`0542e226…` Amman→QAIA, `24d42689…` QAIA→Amman) ·
  POINT_TO_POINT 215–1913 · HALF_DAY 370 · (avoid ADD_ON: STATIONARY_WAITING 266, EXTRA_KM 2).
- Pilot contract: `fullDayRate 656`, `halfDayRate 370`, `minimumFullDays 3`, `INELIGIBLE_UNDER_MIN`, USD, active.

> ⚠️ Pricing nuance to be *confirmed by validation*: whether a transport line's **persisted**
> cost already has Alpha's 25% baked in (net) or is gross. The pilot package net always applies
> 25% once (656×0.75=492/day). The delta therefore depends on the persisted route cost — exactly
> what this validation checks. Expected numbers below are given **both ways** and confirmed against
> the read-only shadow after creation.

---

## 1. Exact quote structure to create
- **Title:** `TEST — Alpha Large Bus Package Pilot — DO NOT USE`
- **Currency:** USD. **Pricing mode:** FIXED (NOT slab — slab is blocked by 11A).
- **Pax:** 30 adults, 0 children (within Large 49's 1–49; package math is pax-independent).
- **Status:** draft/test (do not convert to booking).
- **Supplier (transport):** Alpha; **vehicle:** Large 49; **currency:** USD throughout (no mixed supplier/currency).
- **No** `excursionPackageRate` toggle (leave OFF — overlap guard).
- **Recommended creation method:** the **admin-web quote builder UI** (or the existing quote +
  transport-item API), so the real pricing engine sets persisted costs. Exact add-item
  calls/DTOs to be confirmed read-only at execution; no pricing logic is edited.

## 2. Itinerary days (Scenario A — recommended, deterministic)
| Day | Purpose | Transport item | Counts? |
|---|---|---|---|
| 1 | Arrival transfer | AIRPORT_TRANSFER Large 49 (QAIA→Amman, 370) | **excluded** (airport) |
| 2 | Full touring day | DAILY_FULL_DAY Large 49 (656) | counted (weight 1) |
| 3 | Full touring day | DAILY_FULL_DAY Large 49 (656) | counted (weight 1) |
| 4 | Full touring day | DAILY_FULL_DAY Large 49 (656) | counted (weight 1) |
| (5 opt) | Departure transfer | AIRPORT_TRANSFER Large 49 (Amman→QAIA, 370) | excluded (airport) |

3 DAILY_FULL_DAY days auto-classify as **FULL_DAY_SERVICE** (counted) with **no metadata
required** → meets `minimumFullDays 3`. Airport day(s) classify AIRPORT_TRANSFER → excluded by
default. No stationary/standby, no ADD_ON, no overnight.

## 3. Transport items to create
- Day 1 (+5): VehicleRate AIRPORT_TRANSFER Large 49 USD 370 (`0542e226…` / `24d42689…`).
- Days 2–4: VehicleRate DAILY_FULL_DAY Large 49 USD 656 (`3529a63e-81ec-40f2-b44d-1fc827eea0eb`).
- All on supplier Alpha, vehicle Large 49, USD. One transport item per day, no add-ons.

## 4. Vehicle/rates used
Vehicle **Large 49** `6d575442…`; rates: DAILY_FULL_DAY `3529a63e…` (656), AIRPORT_TRANSFER
`0542e226…`/`24d42689…` (370). **VIP 31‑33 vehicle/rates are NOT used.**

## 5. Expected current route/transfer baseline (predicted; confirm via shadow)
Let `d` = per-day persisted full-day cost; `a` = persisted airport cost.
- If persisted = **net** (price×0.75): d=492, a=277.5 → counted base = 3×492 = **1476**; excluded = **277.5** (×airport days); `currentTransportTotal` = 1476 + 277.5 = **1753.5** (1 airport).
- If persisted = **gross** (price): d=656, a=370 → counted base = **1968**; excluded = **370**; `currentTransportTotal` = **2338** (1 airport).

## 6. Expected package gross / net / delta (predicted)
Package (3 counted full days): **gross = 3×656 = 1968**; **discount 25% → net = 1476**.
- vs **net** baseline: counted base 1476 → **costDelta = 1476 − 1476 = 0** (package == discounted daily card; proves no double-charge).
- vs **gross** baseline: counted base 1968 → **costDelta = 1476 − 1968 = −492** (package applies the 25% the route line didn't).
Airport day excluded/retained in BOTH totals (not in the delta). **Sell delta** = `packageNet × m − countedSell`, `m` = countedSell/countedCost from the day's persisted sell (markup); captured at validation.

> The validation's job is to read the actual `currentTransportTotal`/`difference` from the shadow
> and confirm which case holds and that the math is internally consistent — either result is a
> valid, informative outcome.

**Optional Scenario B (visible saving):** replace days 2–4 with 3 intercity **POINT_TO_POINT**
Large 49 legs (e.g., Amman→Petra→Wadi Rum→Dead Sea, higher rate), mark each **retained**
(`vehicleRetained=true` or `transportDayType=TOURING_ROUTE`) so they count; package net 1476 then
sits clearly below the summed P2P route cost → negative delta. Exact P2P prices captured at execution.

## 7. Expected preview/shadow output (`GET …/package-pricing-shadow`, live-apply OFF)
- `packageContractId === '66f5de06-28df-426c-90b8-ffaa01ed5c5f'` (pilot resolved).
- `packageEligible === true`, `reason` null, `countedFullPackageDays === 3`, `manualRequiredDays === 0`.
- `supplierDiscountPercent === 25`.
- `excludedDays` = the airport day(s) with reason `airport`.
- `warnings` includes `standard-large-bus-49-rate-only-not-vip-31-33` and `excludes-driver-overnight`; NOT `stationary-not-priced-in-pr9`.
- `packageGrossTotal`/`packageNetTotal`/`difference` per §6; `notApplied: true`.

## 8. How to mark day metadata
- Scenario A: **none required** (DAILY_FULL_DAY auto-counts). Optionally set `transportDayType =
  FULL_DAY_SERVICE` on days 2–4 for explicitness; airport days `transportDayType = AIRPORT_TRANSFER`.
- Scenario B: set days 2–4 `vehicleRetained = true` (and optionally `inRetainedBlock = true`) OR
  `transportDayType = TOURING_ROUTE`. Never set `vehicleRetained` AND `vehicleReleased` together.
- Set via the PR7 planner "Transport day (advanced)" UI. Metadata is additive/metadata-only.

## 9. How to save the package selection
`PATCH /api/transport-pricing/quotes/{quoteId}/package-selection` body
`{"option":"PACKAGE_MIN_FULL_DAY"}` (requires `transport.packageOptionSelection` ON locally).
Expect echo with `selectedTransportContractId = "66f5de06-…"`, `notApplied: true`. Then re-GET
the pricing-shadow and confirm `savedSelection.contractId === pilot` and `selectionStale === false`.

## 10. Verify live-apply OFF ⇒ totals unchanged
- Record the quote's persisted `totalCost`/`totalSell` (quote detail) **before** saving the selection.
- With `TRANSPORT_PACKAGE_PRICING_LIVE_APPLY` **OFF**, save the selection, then trigger a
  recalculation (any item touch) and re-read totals → they must be **identical** (the delta is
  not applied). The shadow `difference` shows what *would* apply if the flag were ON.
- (No live flag is enabled at any point in this validation.)

## 11. Cleanup / rollback
- **Clear selection:** `PATCH …/package-selection {"option":null}` → all selection fields null.
- **Reset metadata:** in the planner set days back to Auto / clear `transportDayType` /
  `vehicleRetained`.
- **Archive/delete the test quote:** soft-archive (set inactive/draft) or delete the throwaway
  quote once validation is recorded. Title `TEST — … DO NOT USE` makes it unmistakable.
- No DB rollback otherwise (no schema, no contract created, no totals changed while flag OFF).

## Strict safety (unchanged)
Do NOT enable `TRANSPORT_PACKAGE_PRICING_LIVE_APPLY`; do NOT enable production flags broadly
(validation flags are local/non-prod only); do NOT create the quote until approved; do NOT create
contracts; do NOT edit pricing logic; do NOT run migrations; do NOT touch unrelated files, the
quote-WIP stash, or dana files; keep `proposal-v3-pdf-export.test.ts` excluded.

## Open choices for your approval
- **Scenario A (recommended)** deterministic correctness (delta 0 or −492) vs **Scenario B**
  illustrative saving (clear negative delta, needs retention metadata + chosen P2P legs).
- Creation channel: **admin-web quote builder UI** (engine-correct, recommended) vs the
  quote/transport-item **API**.
- Whether to include the optional departure airport day (day 5).
