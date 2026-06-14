# PR 11A — Scenario B plan (REVISED: coherent retained P2P) — PLAN ONLY

**Date:** 2026-06-14
**Status:** PLAN ONLY. Do NOT create/mutate data until approved. Live-apply flag stays OFF.
**Goal:** a quote where the 3 counted retained days' route baseline exceeds 3×(discounted package
full-day rate), producing a **visible negative delta (saving)** — with an **operationally coherent
itinerary**.

## ⚠️ Data reality that forces a revision
The Large 49 USD P2P network is a **star centred on Aqaba**. The only interior legs that exist are
**Aqaba-origin spokes**: `Aqaba|Aqaba Port|Aqaba South Border|AQJ Airport → Petra (1499) / Wadi Rum
(1348) / Dead Sea (1913)`. There are **no** `Amman→interior`, no interior-to-interior, and **no
return/onward** legs (nothing `Petra→…`, `Wadi Rum→…`, `Dead Sea→…`, or `Amman→Petra`). Amman only
connects to airports/border. So the moving chain in your example (Amman→Petra→Wadi Rum→Dead Sea) is
**not buildable** with real Large 49 rates.

**Recommended coherent alternative — Aqaba fixed-base retained tour:** the group flies into **AQJ
(Aqaba's airport)**, stays based in **Aqaba** for 3 nights, and the **retained** Large 49 does a
full-day excursion each day, then flies out of AQJ. The **base city never changes**, so retention is
unambiguous and "each day starts where the prior ended" holds (every day starts in Aqaba). This is a
real DMC pattern (fixed-base day-touring) and is actually a *cleaner* retained-vehicle test than a
moving itinerary.

**One transparent caveat:** the excursion days use the one-way `Aqaba → {Petra|Wadi Rum|Dead Sea}`
spoke rate as the per-day **retained-excursion cost proxy**. A true round-trip would cost more, so
this *under*-states the baseline — but it is still well above the package rate, so the saving is
clear and the math stays exact/verifiable.

> If you'd rather not use spoke rates as excursion proxies, the only alternative that keeps perfect
> rate-semantics is to **add real interior/round-trip Large 49 routes** — but that's data creation
> (out of scope, and you said no new contracts/rates). Flagging so you can choose.

---

## 1. Coherent itinerary / route legs (Aqaba fixed-base)
| Day | Leg (real route) | Role | Counts? |
|---|---|---|---|
| 1 | AQJ Airport → Aqaba | Arrival (excluded) | no |
| 2 | Aqaba ↔ Petra excursion (retained) | counted full day | yes |
| 3 | Aqaba ↔ Wadi Rum excursion (retained) | counted full day | yes |
| 4 | Aqaba ↔ Dead Sea excursion (retained) | counted full day | yes |
| 5 | Aqaba → AQJ Airport | Departure (excluded) | no |

Base city = **Aqaba** for all 4 nights; vehicle **retained** D2–D4. Fly in/out of **AQJ**.

## 2. Exact Alpha Large 49 USD rates (all standard Large 49 — NOT VIP 31‑33)
| Day | route | vehicleRateId | routeId | svc code | gross | net (×0.75) |
|---|---|---|---|---|---|---|
| 1 | AQJ Airport → Aqaba | `3e711d83-e390-4ac9-b5f0-e4524a1857f6` | `6feedb29-8b64-488a-832e-c0549fb7a4a7` | POINT_TO_POINT | 215 | 161.25 |
| 2 | Aqaba → Petra | `2a93f7df-7a93-4020-9e75-2c3cb7dd2c78` | `25fc140d-89eb-4d2b-91ba-180f49be0bdc` | POINT_TO_POINT | 1499 | 1124.25 |
| 3 | Aqaba → Wadi Rum | `4c1b1434-d689-4ea1-b065-3bc577e1e736` | `05285171-a6fe-4baf-9015-f908071159f5` | POINT_TO_POINT | 1348 | 1011 |
| 4 | Aqaba → Dead Sea | `5bc50f46-3a51-480c-98a0-f997399d0105` | `2eaead6e-626c-4202-a60e-06ac37652e87` | POINT_TO_POINT | 1913 | 1434.75 |
| 5 | Aqaba → AQJ Airport | `45777bbb-e4e5-4e91-8570-809db69e519e` | `53a4c865-f21e-4c13-bf48-08d46de418e7` | POINT_TO_POINT | 215 | 161.25 |

Creation: `serviceId` = Alpha "Point-to-Point" SupplierService `5d411799-4169-405a-9bde-b92ad70cbe1a`
for all 5 legs; `transportServiceTypeId` = POINT_TO_POINT (resolved by code); `transportVehicleId` =
`6d575442-…` (Large 49); `vehicleRateId`/`routeId` per row; `paxCount: 30`; **0% markup**. D1/D5 are
made "excluded airport" via day metadata (`transportDayType = AIRPORT_TRANSFER`) since no Large 49
AQJ *AIRPORT_TRANSFER* rate exists (only P2P AQJ↔Aqaba) — metadata overrides inference.

## 3. Predicted persisted baseline (cost / sell, 0% markup → sell = cost)
D1 161.25 · D2 1124.25 · D3 1011 · D4 1434.75 · D5 161.25 →
**Quote baseline (flag OFF): totalCost = totalSell = 3892.50** (transport-only quote).

## 4. Counted/replaced baseline
D2+D3+D4 = 1124.25 + 1011 + 1434.75 = **3570.00** (cost = sell).

## 5. Excluded airport transfer cost
D1 + D5 = 161.25 + 161.25 = **322.50** (retained, in both totals, not in the delta).

## 6. Package gross
Days 3 × 656 = **1968**. `packageGrossTotal` (incl. excluded) = 1968 + 322.5 = **2290.50**.

## 7. Supplier discount
**25%** → 1968 × 0.25 = **492** (applied once).

## 8. Package net
Days 1968 × 0.75 = **1476**. `packageNetTotal` (incl. excluded) = 1476 + 322.5 = **1798.50**.

## 9. Expected cost delta
`costDelta = 1476 − 3570 = ` **−2094.00** (= shadow `difference` = 1798.5 − 3892.5). **Saving.**

## 10. Expected sell delta
0% markup → m = 1.0 → `sellDelta = 1476 × 1.0 − 3570 = ` **−2094.00** (= cost delta).

## 11. Expected final total if flag ON
`totalCost = 3892.5 + (−2094) = ` **1798.50**; `totalSell = 1798.50`
(final transport = packageNet days 1476 + retained airport 322.5 = 1798.5). **Saving = 2094.**

## 12. Required day metadata
- D1, D5: `transportDayType = AIRPORT_TRANSFER` (excluded); retained/released/block null.
- D2, D3, D4: `transportDayType = POINT_TO_POINT`, **`vehicleRetained = true`**, `inRetainedBlock = true`,
  `vehicleReleased = null` (explicit retained signal makes each P2P day count as a full package day).

## 13. No stationary / standby / overnight / add-on blockers
No STATIONARY_*/STANDBY day types; no ADD_ON (driver-overnight / stationary-waiting / extra-km)
service lines; `excursionPackageRate` left OFF. Expected warnings = only
`standard-large-bus-49-rate-only-not-vip-31-33` + `excludes-driver-overnight` (informational).

## 14. No VIP 31‑33 rates involved
Every rate above is on vehicle **Large 49** (`6d575442-…`). The VIP 31‑33 vehicle
(`49c5fd5d-…`) and its rates are not referenced. The creation script will assert each created
item resolved to "Large 49" and abort on any VIP match (as in Scenario A).

## Expected shadow output (sanity targets, flag OFF)
`packageContractId = 66f5de06-…`, `packageEligible = true`, `countedFullPackageDays = 3`,
`manualRequiredDays = 0`, `currentTransportTotal = 3892.5`, `packageGrossTotal = 2290.5`,
`supplierDiscountPercent = 25`, `packageNetTotal = 1798.5`, `difference = −2094`,
`excludedDays = [D1 airport 161.25, D5 airport 161.25]`, warnings as in §13, `notApplied = true`.
Save selection → `selectionStale = false`, `notApplied = true`; recompute with flag OFF → totals
stay **3892.5 / 3892.5**.

## Decisions / quote
- Second throwaway quote **`TEST — Alpha Large Bus Package Pilot P2P — DO NOT USE`** (Scenario A
  quote `04f87127-…` untouched). 0% markup. Both airport days kept (AQJ).
- **Please confirm the Aqaba fixed-base structure** (it deviates from your moving example only
  because the moving chain is impossible with existing Large 49 rates), and the spoke-rate-as-
  excursion-proxy caveat.

## Strict safety (unchanged)
No live-apply flag; no production flags; no new contracts/rates; no pricing-logic edits; no
migrations; do not touch unrelated files, the quote-WIP stash, or dana files; keep
`proposal-v3-pdf-export.test.ts` excluded.
