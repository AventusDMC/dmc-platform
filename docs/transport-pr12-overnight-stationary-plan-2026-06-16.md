# PR 12 — Driver overnight + stationary/standby pricing (PLAN ONLY)

**Date:** 2026-06-16
**Status:** PLAN ONLY — no code/schema/migration/DB/flag/quote/contract changes.
**Context:** overnight & stationary are currently **blocked/warned, not priced** (PR 11A/11B gates).
PR 12 designs how to price them. Production live-apply flag stays OFF; both pilots (Large 49 +
Medium 30) validated.

## Checkpoint record (PR 12A, 2026-06-16) — documentation only
1. **Overnight ADD_ON service types:** `PETRA_OVERNIGHT`, `DEAD_SEA_OVERNIGHT`, `WADI_RUM_OVERNIGHT`,
   `AQABA_OVERNIGHT` (+ `TRANSPORT_ADD_ON_DAILY_CHARGE`). Rate coverage: **only Almushtari (JOD, flat
   15/night, not route-specific); Alpha pilots have NONE.**
2. **Stationary/standby:** `STATIONARY_WAITING` ADD_ON — Alpha USD route-specific (8 rows, 56–521) +
   Almushtari JOD (40–60); a separate `STATIONARY` service-type has **no rate rows**.
3. **Suppliers/classes with rates:** stationary → Alpha (USD) + Almushtari (JOD); overnight → Almushtari
   (JOD) only.
4. **Missing base-city data:** no `Supplier.baseCity`; only nullable `TransportContract.baseCityOverride`
   (unset) → out-of-base cannot be determined yet.
5. **Missing day-level overnight metadata:** no `overnightCity` / `vehicleReturnsToBase` on
   `QuoteItineraryDay` (has only `transportDayType`/`vehicleRetained`/`vehicleReleased`/`inRetainedBlock`).
6. **Reusable TransportContract policy fields (inert):** `driverOvernightPolicy` (INCLUDED|SEPARATE|
   WAIVED), `driverOvernightAmount`, `driverOvernightOnStationary`, `stationaryChargedSeparately`,
   `stationaryIncludedInPackage`, `stationaryCountsTowardMinDays`, half-day weight fields,
   `baseCityOverride`.
7. **Proposed hybrid model:** reuse contract policy fields + existing ADD_ON rate rows; add only small
   nullable metadata later (`Supplier.baseCity`, day `overnightCity`/`vehicleReturnsToBase`). No new
   rate table.
8. **Recommended split:** 12A docs (this) · 12B additive schema (base city + overnight metadata) · 12C
   shadow calculation · 12D planner UI · 12E controlled validation · 12F live apply behind flag/allowlist.
9. **Risks:** double-counting stationary/full-day; charging base-city overnight by mistake; missing city
   data; Alpha missing overnight rates; **T.5G overnight-fold overlap**; old ADD_ON / excursionPackageRate
   overlap.
10. **Clear rule:** NO overnight or stationary live pricing until shadow validation + explicit approval;
    they remain blocked/warning-only until the full PR 12 flow is implemented and validated.

This PR (12A) is documentation only — no code/schema/migration/DB/flag/quote/contract change.
Production live-apply flag stays OFF. (Filename uses the 2026-06-16 audit date.)

## 0. Read-only audit (2026-06-16)
**Overnight — modeled as city-specific ADD_ON service types:** `PETRA_OVERNIGHT`,
`DEAD_SEA_OVERNIGHT`, `WADI_RUM_OVERNIGHT`, `AQABA_OVERNIGHT` (+ generic `TRANSPORT_ADD_ON_DAILY_CHARGE`).
Rates: **only Almushtari (JOD, flat 15/night, NOT route-specific)**. **Alpha (both pilots) has NO
overnight ADD_ON rates.** Contract has `driverOvernightPolicy` (INCLUDED|SEPARATE|WAIVED, default
SEPARATE) + flat `driverOvernightAmount` + `driverOvernightOnStationary` (default true).
**Stationary/standby:** `STATIONARY_WAITING` ADD_ON rates — **Alpha USD, route-specific, 8 rows,
56–521** + Almushtari JOD (40–60, route-specific). A separate `STATIONARY` service-type exists with
**no rate rows**. `EXTRA_HOUR` / `EXTRA_KM` ADD_ON also exist. Contract has
`stationaryChargedSeparately` / `stationaryIncludedInPackage` / `stationaryCountsTowardMinDays`
(+ half-day weight fields `halfDayCountsTowardMin`, `packageDayWeight`, `halfDayChargedAsFullDay`).
**Base city: MISSING** — no `Supplier.baseCity`; only `TransportContract.baseCityOverride` (nullable,
unset). **Day metadata:** `QuoteItineraryDay` has `transportDayType` / `vehicleRetained` /
`vehicleReleased` / `inRetainedBlock` — **no overnight-city or returns-to-base field.**
**Usage:** only 4 quote-items use an ADD_ON rate.
**Overnight currently:** detected by name (`/overnight/`) → `addOnType DRIVER_OVERNIGHT`; the T.5G
add-on path folds overnight into transport baseCost on package-full-day days (see
[[project_transport_addon_apply_t5g1a]]) — **overlap to reconcile.**

## 1. Business rules to support
**Driver overnight:** charge when the vehicle/driver is retained overnight **out of the supplier's
base city**; no charge in base city; contract policy INCLUDED / SEPARATE / WAIVED (and city-specific
amount); works for ROUTE_TRANSFER **and** PACKAGE regimes; works in per-vehicle **and** capacity-unit
modes (× vehicle units). **Stationary/standby:** free day + vehicle released → no charge; stationary
= vehicle/driver retained, no normal transfer/tour → priced per `STATIONARY_WAITING` (or contract
policy); full-day vs half-day distinguishable (weight); may/may-not count toward package minimum
(`stationaryCountsTowardMinDays`); may/may-not be included in the package rate
(`stationaryIncludedInPackage`); **driver overnight still evaluated on stationary days**
(`driverOvernightOnStationary`).

## 2. Data audit findings (see §0) — what exists vs missing
- **Policy fields EXIST (inert) on TransportContract:** overnight policy/amount, stationary booleans,
  half-day weights, `baseCityOverride`. → reuse.
- **Overnight rate structure EXISTS** (city-specific ADD_ON service types) but **only Almushtari is
  populated; Alpha pilots have none.**
- **Stationary rate structure EXISTS** (`STATIONARY_WAITING`, Alpha USD route-specific).
- **MISSING:** (a) supplier base city (→ can't detect out-of-base); (b) day-level overnight city +
  returns-to-base; (c) Alpha (pilot) overnight rates / a chosen flat amount.
- Overnight currently only reliably priced via the T.5G capacity-unit/per-night fold; **per-vehicle
  vs capacity-unit consistency must be verified.**

## 3. Data model proposal (minimize schema; reuse what exists)
| Concern | Recommendation |
|---|---|
| overnight included/separate/waived | **reuse** `TransportContract.driverOvernightPolicy` |
| flat per-night overnight amount | **reuse** `TransportContract.driverOvernightAmount` |
| city-specific overnight rate | **reuse** the city ADD_ON service types (`*_OVERNIGHT`) + `VehicleRate` rows (populate per supplier/class as a data prereq — not schema) |
| stationary full/half-day + standby | **reuse** `STATIONARY_WAITING` `VehicleRate` rows + contract `stationary*` booleans + half-day weight |
| supplier base city | **NEW additive nullable field `Supplier.baseCity`** (+ keep `TransportContract.baseCityOverride`). The one genuinely missing input. |
| day overnight city / returns-to-base | **NEW additive nullable metadata on `QuoteItineraryDay`** (`overnightCity`, `vehicleReturnsToBase`) — metadata-only, like the PR6 fields. |

**Recommendation: hybrid — reuse existing contract policy fields + existing ADD_ON rate rows; add only
two small additive nullable, metadata-only pieces (`Supplier.baseCity`, day `overnightCity`/
`vehicleReturnsToBase`).** No new rate table needed (city-specific overnight already exists as ADD_ON
service types; stationary as STATIONARY_WAITING). Schema additions are additive/nullable (no behavior
change until read by the new logic) — but still gated to a separate, approved PR 12B.

## 4. Pricing logic proposal (shadow-first; fail closed)
1. **Identify out-of-base nights:** for each retained overnight, compare the day's `overnightCity`
   (metadata) to the supplier base city (`baseCityOverride ?? Supplier.baseCity`). In base → no
   charge. Out of base → evaluate policy.
2. **Apply policy:** `WAIVED`/`INCLUDED` → no separate charge; `SEPARATE` → add an overnight charge =
   the city's `*_OVERNIGHT` ADD_ON rate (× vehicle units in capacity-unit mode) **or** the contract
   flat `driverOvernightAmount` if no city rate; if neither → **block `overnight-rate-missing`**.
3. **Stationary days:** if `vehicleReleased` → no charge; else if `stationaryIncludedInPackage` → no
   separate charge; else charge `STATIONARY_WAITING` rate (full vs half via day type/weight); if no
   rate → **block `stationary-rate-missing`**. `stationaryCountsTowardMinDays` decides eligibility
   contribution; weight per `packageDayWeight`/half-day fields.
4. **Avoid double-counting:** overnight/stationary are **separate add-on lines**, never folded into
   the package full-day rate; a stationary day that `countsTowardMin` is a package day (full/half
   weight) and must NOT also be charged a separate stationary fee unless `stationaryChargedSeparately`
   and NOT `stationaryIncludedInPackage`. Reconcile with the T.5G fold (do not apply both the T.5G
   baseCost fold AND a PR 12 separate line).
5. **Airport transfers stay separate by default; driver overnight stays separate unless INCLUDED.**
6. **Fail closed:** missing rate / unknown overnight city / missing base city / unclear retained-vs-
   released / capacity-unit ambiguity → block + manual-required (no silent pricing).

## 5. Day metadata / itinerary requirements
| Needed | Available? |
|---|---|
| overnight city | **MISSING** → new day field `overnightCity` |
| supplier base city | **MISSING** → new `Supplier.baseCity` (+ `baseCityOverride`) |
| retained vehicle days | YES (`vehicleRetained` / `inRetainedBlock`) |
| stationary/standby day type | YES (`transportDayType` ∈ STATIONARY_FULL_DAY / STATIONARY_HALF_DAY / STANDBY_WAITING) |
| half-day vs full-day | YES (operational type + `packageDayWeight`) |
| vehicle released | YES (`vehicleReleased`) |
| driver returns to base | **MISSING** → new day field `vehicleReturnsToBase` |
| city/area for overnight rate | from `overnightCity` → maps to a `*_OVERNIGHT` service type |

## 6. UI / admin requirements (plan only)
Extend the PR7 "Transport day (advanced)" planner: stationary full-day / half-day / standby
(`transportDayType` already supports these — add the options); driver-overnight included/separate/
waived (contract-level, surfaced read-only) + `overnightCity` + `vehicleReturnsToBase` (day-level);
and a per-contract admin for overnight/stationary policy + base city. Stationary-counts-toward-minimum
is a contract setting (admin), shown read-only on the day. No UI built in this PR.

## 7. Safety gates / blockers (remain blocked until each is handled)
missing overnight rate · missing stationary rate · unknown overnight city · missing supplier base
city · unclear retained/released (contradiction) · package-with-stationary-but-no-stationary-policy ·
capacity-unit ambiguity · mixed suppliers · mixed vehicles. All → block / manual-required (carry the
PR 11A/11B fail-closed posture; the current PR11A `stationary-standby-present` /
`addon-overnight-present` blocks stay until PR 12 prices them).

## 8. Tests (for the implementation)
- base-city overnight → no charge; out-of-base overnight → charge.
- overnight INCLUDED → no separate charge; WAIVED → no charge; missing rate → blocked/manual.
- stationary released vehicle → no charge; stationary full-day with rate → charge; half-day → charge/
  weight per contract; stationary INCLUDED in package → no separate charge.
- stationary counts toward minimum only when `stationaryCountsTowardMinDays`.
- standby/waiting with rate → charge; missing stationary rate → blocked/manual.
- per-vehicle mode applies overnight correctly; capacity-unit mode × units correctly.
- **no double-count** with the package full-day rate (and no overlap with the T.5G fold).
- QuoteItems not mutated (shadow/diagnostic stages); only quote-level deltas when live (later stage).
- unknown overnight city / missing base city → blocked.

## 9. Recommended PR split
- **PR 12A — audit + docs only** (this). No code.
- **PR 12B — additive schema** (only the genuine gaps): `Supplier.baseCity` + `QuoteItineraryDay.
  overnightCity` / `vehicleReturnsToBase`, nullable/metadata-only (mirrors PR6). + backfill base city
  for Alpha/Almushtari (data prereq, separate approval).
- **PR 12C — shadow calculation** for overnight + stationary (read-only diagnostic, flag-gated, like
  PR9) — surfaces charges/blocks; no live change.
- **PR 12D — planner UI metadata** (stationary/standby/overnight-city/returns-to-base) + contract
  admin for policy/base city.
- **PR 12E — controlled test-quote validation** (throwaway quotes; flag-ON reversed in-run).
- **PR 12F — live apply** behind the flag + allowlist (reconcile/retire the T.5G fold to avoid
  double-charge; coordinate with PR 13).
- Plus a **data prereq**: populate Alpha overnight ADD_ON rates (or set contract flat amount) — the
  pilots currently have none.

Recommendation: **12A now (docs)**, then 12B (schema), 12C (shadow), 12D (UI), 12E (validate), 12F
(live) — each separately approved. Do not change live pricing until 12F + explicit activation.

## 10. Risks
- **Double-counting full-day + stationary**, and **overlap with the existing T.5G overnight fold**
  into baseCost → must reconcile (apply EITHER the fold OR a PR 12 separate line, never both).
- **Charging overnight on base-city nights** — mitigated by base city + per-night out-of-base check;
  fail closed if base city unknown.
- **Missing city data** (overnight city, base city) — the main gap; fail closed until populated.
- **Supplier-specific rules** (Alpha has stationary but no overnight rates; Almushtari is JOD/flat) →
  per-supplier handling; pilots need overnight rates or a flat amount before overnight pricing.
- **per-vehicle vs capacity-unit mismatch** — verify overnight scales by vehicle units consistently.
- **Old ADD_ON / excursionPackageRate overlap** — coordinate with PR 13 retirement.
- **Real quote totals changing unexpectedly** — everything stays flag-gated + shadow-first +
  fail-closed; no live change before 12F.
- **Incomplete contract data** (policy/base city unset) → block, never guess.

## Acceptance criteria (for the PR 12 chain)
- Overnight charged only out-of-base, per contract policy, with no double-count (and no T.5G overlap);
  stationary priced per contract (separate/included/counts-toward-min) with full/half weight.
- Per-vehicle and capacity-unit both correct; airport separate; fail-closed on any missing/ambiguous
  data.
- Shadow-first; no live pricing change until 12F behind the flag + allowlist; no QuoteItem mutation;
  pilots' existing validated behavior unchanged.
- Any schema additions are additive/nullable/metadata-only; production flag stays OFF until explicit
  activation.

## Strictly not in this step
No code/schema/migration/DB/flag/quote/contract change; no PR 13; no production activation; no
quote-WIP stash; no dana; `proposal-v3-pdf-export.test.ts` excluded.
