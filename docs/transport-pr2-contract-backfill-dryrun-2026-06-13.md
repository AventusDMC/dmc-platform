# PR 2 — TransportContract + default ROUTE_TRANSFER backfill DRY-RUN

**Date:** 2026-06-13
**Status:** DRY-RUN ONLY — no schema, migration, or write performed. For review before
implementing PR 2. Read-only SELECT script (deleted). Live Railway DB.

## Reconciliation (every row accounted for — no silent drops)
| Rate table | Total rows | Attached | Skipped |
|---|---|---|---|
| VehicleRate | 733 | 733 | 0 |
| TransportPricingRule | 699 | 699 | 0 |
| TouringRoutePricing | 256 | 241 | 15 |
| **Total** | **1688** | **1673** | **15** |

- **Ambiguous rows: 0.** **Priced-Alpha ambiguity: 0** → the stop-condition is not triggered.
- **Skipped: 15** — all `TouringRoutePricing` rows under the non-commercial **Amman West
  Hotel** (kept `contractId = NULL`). No Canonical Fleet / General Transport rows needed
  skipping (General Transport vehicles own 0 rates; rows touching Canonical Fleet
  *reference vehicles* carry a commercial `supplierId` — see Note B).

## Proposed contracts: 17 (all under COMMERCIAL suppliers only)
Regime = `ROUTE_TRANSFER` for all. Key = supplier + vehicleClass + currency.

| Supplier | vehicleClass | Currency | VehicleRate | PricingRule | TouringPricing | Total |
|---|---|---|---|---|---|---|
| Almushtari | Sedan | JOD | 59 | 54 | 55 | 168 |
| Almushtari | Mini Van | JOD | 60 | 53 | 54 | 167 |
| Almushtari | Van | JOD | 59 | 52 | 53 | 164 |
| Almushtari | SUV | JOD | 55 | 52 | 0 | 107 |
| Almushtari | Small Mini Bus | JOD | 4 | 0 | 0 | 4 |
| Alpha | Large Bus | USD | 124 | 122 | 0 | 246 |
| Alpha | Medium Bus | USD | 124 | 122 | 0 | 246 |
| Alpha | Small Mini Bus | USD | 124 | 122 | 0 | 246 |
| Alpha | Mini Van | USD | 62 | 61 | 0 | 123 |
| Alpha | Van | USD | 62 | 61 | 0 | 123 |
| Alpha | Mini Van | JOD | 0 | 0 | 15 | 15 |
| Alpha | Medium Bus | JOD | 0 | 0 | 16 | 16 |
| Alpha | Van | JOD | 0 | 0 | 16 | 16 |
| Alpha | Large Bus | JOD | 0 | 0 | 1 | 1 |
| Alpha | Small Mini Bus | JOD | 0 | 0 | 1 | 1 |
| Desert Compass | Large Bus | JOD | 0 | 0 | 15 | 15 |
| Desert Compass | Small Mini Bus | JOD | 0 | 0 | 15 | 15 |

**Priced commercial rows (the ones that matter) all group cleanly, single-currency,
resolved supplier:** the 5 Almushtari JOD contracts and the 5 Alpha USD contracts hold
every VehicleRate + TransportPricingRule. No priced row is ambiguous.

## Observations / design points needing your confirmation

**A — Multi-currency → separate per-currency contracts.** Alpha's transfer/rule rates
are USD; Alpha also has *touring-route* pricings in **JOD** (15–16 per class). Because a
contract is single-currency, this yields one USD contract + one small JOD touring-only
contract per Alpha class (the 5 small JOD rows above). This is correct and inert.
*Proposed: keep as separate per-currency contracts.*

**B — Exclusion is by EFFECTIVE supplier (row.supplierId, else the vehicle's owner).**
Zero contracts are created for Canonical Fleet / General Transport / Amman West Hotel.
Some touring-pricing rows owned by a *commercial* supplier reference a Canonical Fleet
*reference vehicle* for its class (e.g. Desert Compass touring pricings using a Large
Bus reference vehicle → "Desert Compass · Large Bus" contract). The rate is commercial;
only the class label comes from the reference vehicle. *Proposed: attach to the
commercial supplier (current behavior); still no non-commercial contracts.*

**C — Contract validity NULLABLE.** Touring-only groups (the JOD + Desert Compass
contracts) have member rows with no validFrom/validTo → contract validity would be
NULL. *Proposed: make `validFrom`/`validTo` nullable on TransportContract* (descriptive
only, never read by pricing). Priced contracts derive 2026-01-01…2026-12-31 from members.

**D — `contractId` nullable on all 3 rate tables.** The 15 skipped Amman West Hotel rows
keep `contractId = NULL`. *Proposed: nullable FK, no behavior wired.*

## Proposed PR 2 structure (to implement AFTER approval)
- New model `TransportContract` (additive): `supplierId`, `vehicleClass`, `regime`
  (`ROUTE_TRANSFER` | `PACKAGE_MIN_FULL_DAY`), `currency`, `validFrom?`, `validTo?`,
  `active`, `minimumFullDays?`, `minimumDayPolicy?`, `baseCityOverride?`, + inert
  driver-overnight / stationary / package / half-day flag columns (all nullable/defaulted,
  unused). Enums `TransportRateRegime`, `MinimumDayPolicy` added; **no DAILY_PACKAGE
  activation**, no pricing/quote/UI change.
- Nullable `transportContractId` on `VehicleRate`, `TransportPricingRule`,
  `TouringRoutePricing`.
- Backfill: create the 17 ROUTE_TRANSFER contracts above; attach the 1673 rows by id;
  leave the 15 skipped rows NULL. Idempotent + self-guarded (abort on count drift).
- Safety: recovery-point snapshot of the 3 rate tables + contracts; `migrate deploy`
  (never `migrate dev`); `migrate status` before & after; re-run dry-run immediately
  before write.

## Acceptance (unchanged from your brief)
Pricing output unchanged · quote builder unchanged · route/transfer rates resolve as
before · all commercial rates get a default ROUTE_TRANSFER contract · PACKAGE model
exists but inactive · DAILY_PACKAGE inactive · no unrelated files · CI/deploys pass.
