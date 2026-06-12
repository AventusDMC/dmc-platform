# Transport Contract / Rate-Regime Refactor — Final Staged Plan

**Date:** 2026-06-13
**Status:** PLAN ONLY — no schema, migrations, seeds, quote logic, or data changed.
**Basis:** `transport audit (2026-06-13)` — engine foundation is sound; the missing
piece is a first-class contract/regime layer, not a rebuild.

> This supersedes the earlier draft of this file. The key correction: **package
> eligibility counts full *retained-vehicle* transport days — including full-day
> point-to-point movements — not only touring days.** Each day is classified on **two
> independent axes** (operational service type **and** package-day eligibility).

---

## 0. Concept: Supplier + Vehicle Class + Rate Regime

Rates today are a flat pool selected by cheapest cost. We add a first-class
**`TransportContract`** that groups existing rate rows by supplier + vehicle class +
regime, and carries the commercial terms (min days, overnight, stationary). Existing
rate rows get a **nullable** link up to a contract and are backfilled into a default
ROUTE_TRANSFER contract so **current behavior is byte-for-byte unchanged**.

```
Supplier A + SEDAN ──┬─ ROUTE_TRANSFER       contract → existing VehicleRate / Rule / TouringRoutePricing rows
                     └─ PACKAGE_MIN_FULL_DAY contract → existing rows (min 3 days, overnight, stationary terms)
```

A supplier + vehicle class may hold **one or both** regimes (A+Sedan, A+Mini Van,
B+Medium Bus, B+Large Bus can each have both). `TouringRoutePricing` is **kept** and
becomes a rate type *inside* a contract.

---

## The two-axis day model (the heart of this refactor)

Every itinerary transport day is classified on **two separate axes**:

**Axis 1 — Operational service type** (what physically happens):
`AIRPORT_TRANSFER`, `POINT_TO_POINT`, `HALF_DAY_SERVICE`, `TOURING_ROUTE`,
`FULL_DAY_DISPOSAL`, `STATIONARY_FULL_DAY`, `STATIONARY_HALF_DAY`, `STANDBY_WAITING`,
`FREE_NO_VEHICLE`.

**Axis 2 — Package-day weight** (`packageDayWeight: number`, one of `0 / 0.5 / 1`):
how much the day counts toward the package minimum, **independent of the operational
type**. (This replaces the earlier boolean `countsAsFullPackageDay`, which could not
express a half-day's 0.5 contribution.)

**Why two axes:** a Day-1 `Amman → Petra` point-to-point can be a short transfer
(weight 0), a half-day retained service (weight 0.5), or a full retained transport day
(weight 1) — the operational type is identical; only retention/duration differs. A
single boolean axis cannot express this; the audit's old "P2P never counts" assumption
was wrong.

**Default `packageDayWeight` resolution** (overridable per day by the planner):

| Operational type | Default weight | Rule |
|---|---|---|
| `TOURING_ROUTE` | **1.0** | always a full transport day |
| `FULL_DAY_DISPOSAL` | **1.0** | retained full day |
| `POINT_TO_POINT` | **1.0 iff `vehicleRetained`** full day, else **0** | full-day retained P2P counts; short P2P does not |
| `HALF_DAY_SERVICE` | **0.5 iff `halfDayCountsTowardMin`, else 0** | `1.0` if contract `halfDayChargedAsFullDay`; weight ignored unless `packageDayWeight` logic enabled |
| `AIRPORT_TRANSFER` | **0** | unless contract explicitly includes it |
| `STATIONARY_FULL_DAY` | **1.0 iff** `stationaryCountsTowardMinDays`, else **0** | contract flag |
| `STATIONARY_HALF_DAY` | **0** | 0.5 only on manual override |
| `STANDBY_WAITING` | **0** | unless contract specifically says so |
| `FREE_NO_VEHICLE` | **0** | never; no vehicle |

`vehicleRetained` is a per-day attribute (vehicle/driver held with the group for the
day vs. dropped after a short transfer). Planner-overridable.

**Retention auto-presumption (Q1, locked 2026-06-13):** a P2P day does **not** count
by default. The system auto-presumes `vehicleRetained = true` (→ weight 1.0) only when
**all** of: *same supplier* + *same vehicle* assigned across consecutive package days,
**and** the group sleeps outside the supplier base **or** continues the trip next day,
**and** the vehicle/driver is expected to stay with the group. A P2P leg inside a
confirmed package block of ≥ `minimumFullDays` full retained days also counts. A
direct drop with the vehicle released after drop-off (e.g. `Dead Sea → Amman` direct)
stays `POINT_TO_POINT`, weight 0. **The UI must always allow manual override** of the
presumption in either direction.

**Half-day accumulation:** a half-day contributes 0.5 only when the contract enables
`packageDayWeight` logic; otherwise 0 unless `twoHalfDaysEqualFullDay` (two 0.5s →
1.0) or `halfDayChargedAsFullDay` (each → 1.0) applies. **A half-day never silently
counts as a full package day.**

**Package eligibility:** if `sum(packageDayWeight) >= contract.minimumFullDays`, the
package contract prices the counted days at the full-day package rate (and half-days
at `halfDayRate` unless charged as full) — even when the operational type is
`POINT_TO_POINT`. Below the minimum, the **minimum-day policy** (§6) decides ineligible
vs. charge-the-minimum.

**Worked cases that qualify as a 3-day package:**
- D1 Amman→Petra P2P (retained) · D2 Petra service · D3 Petra→Wadi Rum (retained) → 3 counted.
- D1 Amman→Petra P2P · D2 Petra→Wadi Rum P2P · D3 Wadi Rum→Aqaba P2P, all retained → 3 counted → package rate, **not** 3 separate P2P rates.

**Half-day case:** `Dead Sea hotel → Amman hotel` is `POINT_TO_POINT` if it's a direct
drop; it is `HALF_DAY_SERVICE` (or `POINT_TO_POINT` + `HALF_DAY_SERVICE`, per the
supplier contract) when the vehicle is retained for half-day service en route. Under a
package contract it contributes `packageDayWeight = 0.5` (or 1.0 if
`halfDayChargedAsFullDay`), and is priced at `halfDayRate` unless charged as a full day.

**Airport classification (Q2, locked 2026-06-13):** airport transfers are **separate by
default** (`airportTransferIncluded = false`); billed as `AIRPORT_TRANSFER` unless the
specific contract includes them. A pure airport leg (`QAIA → Amman hotel`,
`Dead Sea → QAIA`) is a transfer, weight 0. But an airport leg with retained vehicle +
sightseeing (`QAIA → Madaba → Mount Nebo → Dead Sea`) is **not** a simple transfer —
classify it as `TOURING_ROUTE` or a full retained transport day per the contract (and it
can then count toward the minimum).

**Cases that do NOT auto-count:** a standalone short airport transfer; a short
non-retained P2P outside any package; a stationary half-day; a standby day; and a
`HALF_DAY_SERVICE` when the contract has not enabled half-day weighting.

---

## 1. Proposed data-model changes (all additive, nullable/defaulted)

### 1.1 New enums
- `VehicleClass`: `SEDAN, SUV, MINI_VAN, VAN, SMALL_MINI_BUS, MEDIUM_BUS, LARGE_BUS, LARGE_BUS_X`
- `TransportRateRegime`: `ROUTE_TRANSFER, PACKAGE_MIN_FULL_DAY`
- `MinimumDayPolicy`: `INELIGIBLE_UNDER_MIN` (default), `CHARGE_MINIMUM_DAYS`
- `DriverOvernightPolicy`: `INCLUDED, SEPARATE, WAIVED, NONE`
- `DayOperationalType`: `AIRPORT_TRANSFER, POINT_TO_POINT, HALF_DAY_SERVICE, TOURING_ROUTE, FULL_DAY_DISPOSAL, STATIONARY_FULL_DAY, STATIONARY_HALF_DAY, STANDBY_WAITING, FREE_NO_VEHICLE`
- Extend `TransportServiceClassification` with `HALF_DAY_SERVICE, STATIONARY_FULL_DAY, STATIONARY_HALF_DAY, STANDBY_WAITING`
  (keep existing `HALF_DAY`/`DAILY_PACKAGE`; `DAILY_PACKAGE` stays but **gated** — see §6).

### 1.2 New model `TransportContract`
```
model TransportContract {
  id                            String              @id @default(uuid())
  supplierId                    String
  vehicleClass                  String              // VehicleClass (string-validated first; DB enum later — §5)
  vehicleId                     String?             // optional pin for exceptions
  regime                        TransportRateRegime
  currency                      String
  validFrom                     DateTime
  validTo                       DateTime
  active                        Boolean  @default(true)

  // PACKAGE_MIN_FULL_DAY terms
  minimumFullDays               Int?
  minimumDayPolicy              MinimumDayPolicy     @default(INELIGIBLE_UNDER_MIN)
  fullDayRate                   Float?               // package full-day rate (per vehicle/class)
  halfDayRate                   Float?               // package half-day rate
  airportTransferIncluded       Boolean  @default(false)  // package: airport transfer included vs separate
  pointToPointIncluded          Boolean  @default(false)  // package: short P2P included vs separate

  // Half-day service terms (apply to ROUTE and PACKAGE; package-weight fields used by PACKAGE)
  halfDayCountsTowardMin        Boolean  @default(false)  // does a half-day contribute to the minimum at all
  packageDayWeight              Float    @default(0.5)    // weight of one half-day toward the minimum
  twoHalfDaysEqualFullDay       Boolean  @default(false)  // 2 × 0.5 collapse to 1.0
  halfDayChargedAsFullDay       Boolean  @default(false)  // each half-day weighs 1.0 and bills full-day rate
  halfDayIncludedInPackage      Boolean  @default(false)  // half-day included vs charged separately

  // Driver overnight (base-city-relative — Q3/Q5)
  driverOvernightPolicy         DriverOvernightPolicy @default(SEPARATE)
  driverOvernightAmount         Float?               // per night when SEPARATE (or via city rate rows)
  baseCityOverride              String?              // overrides Supplier.baseCity for this contract only

  // Stationary terms
  stationaryChargedSeparately   Boolean  @default(true)
  stationaryIncludedInPackage   Boolean  @default(false)
  stationaryCountsTowardMinDays Boolean  @default(false)
  driverOvernightOnStationary   Boolean  @default(true)

  notes                         String?
  createdAt / updatedAt

  supplier              Supplier @relation(...)
  vehicleRates          VehicleRate[]
  transportPricingRules TransportPricingRule[]
  touringRoutePricings  TouringRoutePricing[]
}
```

### 1.3 Nullable grouping link on existing rate models
Add `transportContractId String?` to **`VehicleRate`**, **`TransportPricingRule`**,
**`TouringRoutePricing`**. Inert until the resolver reads it.

### 1.4 Vehicle class (safe path — §5)
Add `Vehicle.vehicleClass String?` **beside** free-text `vehicleType` (do not retype).

### 1.5 Day classification (shadow first)
Add per quote-day: `operationalType DayOperationalType?`, `vehicleRetained Boolean?`,
`packageDayWeight Float?` (computed default `0 / 0.5 / 1` + manual override). The
boolean "counts" is derived as `packageDayWeight > 0`.

### 1.6 City/area-specific rates
Stationary and overnight rate rows carry an optional place/area dimension
(`fromPlaceId` or coarser `operationalAreaId`) so Petra ≠ Aqaba pricing resolves.

### 1.7 Supplier base city (overnight relativity — Q3)
Add `Supplier.baseCity String?` (or `baseCityAreaId`) as the default operating base.
`TransportContract.baseCityOverride` (§1.2) wins when a supplier runs a special base
for a specific contract. Driver overnight is evaluated relative to this base.

---

## 2. Migration & backfill strategy

1. **Additive schema** (enums, `TransportContract`, nullable FKs, `vehicleClass`,
   day-classification columns). Zero behavior change on deploy.
2. **Default ROUTE_TRANSFER backfill:** for each distinct `(supplier, vehicleClass)`
   owning rate rows, create one `ROUTE_TRANSFER` contract (currency/validity from its
   rows) and set `transportContractId` on those rows. Same rows still resolve → same
   prices.
3. **Vehicle-class backfill** via §5 dry-run → reviewed apply; unmappable rows stay
   `NULL` and are flagged.
4. **Day classification** computed lazily in shadow; no historical rewrite.
5. **Flags OFF:** package regime, options resolver, stationary charging, new overnight
   path all inert until explicitly enabled per environment.
6. **Single shared Railway DB** — run `prisma migrate status` before assuming prod
   state; Vercel does not auto-apply migrations.

---

## 3. Affected backend services / files

- `prisma/schema.prisma` — new model/enums/columns.
- `transport-service-types/transport-service-types.service.ts` — register stationary
  classifications; keep `DAILY_PACKAGE` gated until §6.
- `transport-pricing/transport-pricing.service.ts` — contract-aware
  `resolvePricingRule` / `findMatchingRate`; **options resolver**; overnight &
  stationary calculators; vehicle-class matching (reuse existing canonical matcher).
- `quotes/quotes.service.ts` — transport branch (~5611–5844): consume options
  resolver; **fix overnight per-vehicle-mode gap** (currently `capacity_unit`-only at
  ~5821); min-days enforcement; day classification.
- `quote-itinerary/quote-itinerary.service.ts` — expose per-day operational type +
  package-day eligibility.
- New module `transport-contracts/` — CRUD for contracts/regimes (+ `/api` proxy
  routes in admin-web).
- `suppliers/` — surface contract terms + new `Supplier.baseCity` (overnight relativity);
  **discount logic untouched**.

---

## 4. Quote-calculation changes — options, never silent cheapest

A **Transport Options Resolver** returns a structured comparison per trip/segment:

```
TransportOptions {
  dayPlan: [{ day, operationalType, vehicleRetained, packageDayWeight, place,
              billedAs: 'half-day'|'full-day'|'separate-transfer'|'free' }]
  options: [
    { method: 'ROUTE',   total, currency, lines[], complete, missingRates[] },
    { method: 'PACKAGE', eligible, ineligibleReason?, total, currency,
                         countedFullPackageDays,   // = sum(packageDayWeight)
                         minimumFullDays, billedAtMinimum,
                         halfDays: [{ day, weight, chargedAs, includedOrSeparate }],
                         nonCountedTransferDays[], lines[] }
  ]
  driverOvernight: { policy, nights, amount, included, perCity[] }
  stationary: [{ day, type, cost, includedInPackage, countsTowardMin, chargedSeparately }]
  recommended: 'ROUTE' | 'PACKAGE'        // cheapest *eligible* — a hint, not a silent choice
  selected:    'ROUTE' | 'PACKAGE' | manual
  warnings: [ 'No package rate for SEDAN', 'Stationary rate missing for Aqaba', ... ]
}
```

Ships **behind a flag**, shadow first (compute + log, don't change stored cost), then
surfaced. Cheapest **eligible** is recommended; planner sees method + supplier and can
override.

---

## 5. Canonical vehicle classes — safe, non-destructive

8 classes: **Sedan, SUV, Mini Van, Van, Small Mini Bus, Medium Bus, Large Bus,
Large Bus X.** Current taxonomy has 6; **SUV** and **Large Bus X** missing.

1. `VehicleClass` as **constants + alias map** (extends `normalizeVehicleTypeLabel`).
2. Nullable `Vehicle.vehicleClass`; **dry-run report** of every distinct `vehicleType`
   → proposed class + unmappable list. Ship report, get sign-off, then backfill.
3. Pricing keeps using the existing canonical matcher until `vehicleClass` is verified.
4. **Only later** (optional separate phase) promote to DB enum / `NOT NULL`.

---

## 6. Minimum full days — enforce before activating PACKAGE

**Do not seed/activate `DAILY_PACKAGE` until `minimumFullDays` is enforced.** Today the
"min 3 days" is a cosmetic note and `DAILY_PACKAGE` isn't seeded.

- `countedFullPackageDays = sum(packageDayWeight)` across days (§ two-axis model) —
  full days add `1.0`, qualifying half-days add `0.5` (or `1.0` if
  `halfDayChargedAsFullDay`; two halves collapse to `1.0` if `twoHalfDaysEqualFullDay`).
- `counted >= minimumFullDays` → eligible; full days bill `fullDayRate`, half-days bill
  `halfDayRate` (unless charged as full / included).
- `counted < minimumFullDays`:
  - `INELIGIBLE_UNDER_MIN` (default) → package **not offered**; reason shown; ROUTE used.
  - `CHARGE_MINIMUM_DAYS` → package allowed, **billed at the minimum** (e.g. 3×),
    labelled "billed at 3-day minimum."
- **Never** silently price a 1- or 2-day package as 1×/2× unless the contract is
  explicitly `CHARGE_MINIMUM_DAYS` (which still bills the floor).

**Confirmed default commercial logic (locked 2026-06-13):** *minimum 3 full days = 3
full **counted** transport days.* Half-days are valid, priceable services but **do not
help satisfy the minimum** unless that supplier's contract explicitly enables it. The
conservative defaults are fixed:
`halfDayCountsTowardMin = false`, `twoHalfDaysEqualFullDay = false`,
`halfDayChargedAsFullDay = false`, `halfDayIncludedInPackage = false`. Each is enabled
**per-supplier-contract only**.

**Half-day added to an already-eligible package:** when the package is already eligible
(min met by full days) and a `HALF_DAY_SERVICE` is added, price it at the contract
`halfDayRate`; if `halfDayRate` is absent, surface **"manual pricing required"** — never
auto-fold it into a full day or drop it silently.

---

## 7. Driver overnight — first-class, both pricing modes

**Fix:** overnight is applied only in `capacity_unit` mode today; per-vehicle quotes
drop it. New design:
- Contract-level `driverOvernightPolicy` (`INCLUDED / SEPARATE / WAIVED / NONE`) +
  per-night amount (flat or **city/area-specific** rate rows: Petra ≠ Aqaba).
- **Per-night, base-city-relative (Q3/Q5, locked 2026-06-13).** A night incurs
  overnight **only** when the vehicle/driver is retained **outside** the supplier base
  (`Supplier.baseCity`, or `TransportContract.baseCityOverride`) that night. Nights at
  base = no overnight. Charge is **per out-of-base night, not per stationary day**.
  Independent of pricing mode (fixes the per-vehicle gap).
- Worked: Amman-based supplier → overnight in Amman = none; overnight in Petra / Wadi
  Rum / Aqaba / Dead Sea = overnight applies unless contract `INCLUDED`/`WAIVED`.
- `INCLUDED` → 0 add, shown included. `SEPARATE` → own line (amount × out-of-base
  nights). `WAIVED` → 0, labelled waived. **Manual override** supported.
- **Stationary days trigger overnight *evaluation*** (`driverOvernightOnStationary =
  true`), but the charge applies only if that night is out-of-base and not
  included/waived — e.g. a stationary day in the base city = stationary charge but **no**
  overnight; standby that returns to base at night = no overnight.

---

## 8. Stationary / standby — first-class, never a free day

| Day | Charge | Counts toward min? |
|---|---|---|
| `FREE_NO_VEHICLE` (vehicle released) | none | never |
| `STATIONARY_FULL_DAY` (vehicle retained, no movement) | stationary full-day rate | only iff `stationaryCountsTowardMinDays` |
| `STATIONARY_HALF_DAY` | stationary half-day rate | no (unless manual override) |
| `STANDBY_WAITING` | standby/waiting rate | no (unless contract says so) |

Contract flags: `stationaryChargedSeparately`, `stationaryIncludedInPackage`,
`stationaryCountsTowardMinDays`, `driverOvernightOnStationary`. Driver overnight is
still evaluated on stationary days (per §7 — charged only on out-of-base nights).

**Stationary rate resolution (Q4, locked 2026-06-13) — support both, city wins:**
1. city/area-specific stationary rate (supplier + vehicle class + place/area) → use it;
2. else flat stationary rate (supplier + vehicle class) → use it;
3. else **missing stationary rate / manual pricing required** warning (never silent zero).

City/area is **optional** per rate — suppliers with one flat rate everywhere need only
the level-2 row; Petra/Wadi Rum/Aqaba/Dead Sea/Amman differences use level-1 overrides.

---

## 9. Seed / data cleanup required

- Add **SUV** and **Large Bus X** to the canonical fleet taxonomy.
- Build the `vehicleType` alias map + produce the unmappable-rows report.
- **Do not** seed `DAILY_PACKAGE` until §6 enforcement lands.
- Add stationary service types (`STATIONARY_FULL_DAY`, `STATIONARY_HALF_DAY`,
  `STANDBY_WAITING`).
- Author **one pilot PACKAGE_MIN_FULL_DAY contract** (e.g. Alpha large-bus 3-day) with
  min-days, overnight, and stationary terms for end-to-end validation.
- Review known route-pool errors (QAIA→Amman wrong pool, Wadi Rum→Dead Sea under
  DAILY_FULL_DAY, Bethany→Dead Sea missing) during the contract data pass.

---

## 10. Feature flags / safe activation

- `transport.contracts` — read contract grouping (default on after backfill; inert by design).
- `transport.dayClassification` — shadow compute of day axes.
- `transport.packageRegime` — package eligibility + pricing (off until PR 4 & 5 land).
- `transport.overnightFirstClass` — new overnight path (off → on after parity check).
- `transport.stationary` — stationary charging.
- `transport.optionsResolver` — shadow → surfaced.
Activation is **per environment**, package regime **opt-in/pilot first**.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Mispricing during transition | Additive schema; default ROUTE contracts preserve resolution; resolver in shadow |
| Day-axis misclassification (free vs stationary; retained vs short P2P) | Planner-visible overrides + safe defaults; **never auto-charge** an unmarked stationary/retained day |
| "Full day" disputes | Counting is contract-configurable + shown in the quote with per-day reasons |
| Messy vehicle data | Dry-run + manual review; never auto-coerce |
| Overnight double-count (service day vs stationary) | Single source of truth in resolver |
| Test fragility | `page.test.tsx` source-grep tests; `nest build` compiles `*.test.ts` (no ESM-only constructs); ~12 admin-web + ~19 api/bookings failures are tolerated baseline — check before reporting |
| Scope creep in quote builder | Options resolver flag-gated + shadowed |
| Three overlapping package mechanisms | Retire `FULL_DAY` ad-hoc + `excursionPackageRate` only in PR 10 after regime parity |

---

## 12. Acceptance test cases

1. Existing route/transfer quote → **same result** after default ROUTE_TRANSFER backfill.
2. Same supplier + same vehicle class can hold **both** route and package contracts.
3. Package with `< minimumFullDays` counted → **ineligible** by default.
4. Package `< min`, policy `CHARGE_MINIMUM_DAYS` → charges the minimum (e.g. 3 days).
5. Three full **touring** days → package eligible.
6. Three full **retained point-to-point** days → package eligible (not 3 separate P2P rates).
7. **Airport-transfer-only** day does **not** count unless contract explicitly includes it.
8. Short P2P **outside** a package → point-to-point pricing.
9. Full retained P2P **inside** 3 full transport days → package full-day pricing.
10. Free day, vehicle released → **no charge**.
11. Stationary full day → stationary rate charged.
12. Stationary full day counts toward min **only** when the contract flag says so.
13. Stationary half day does **not** count as a full day by default.
14. Driver overnight applies in **per-vehicle** mode (current bug fixed).
15. Driver overnight applies in **capacity-unit** mode.
16. Overnight **not added** when contract says included.
17. **City-specific** overnight (Petra vs Aqaba) resolves correctly.
18. Missing package rate → **warning**, not silent wrong pricing.
19. Missing stationary rate → warning / manual-required state.
20. Quote builder shows **route + package** options with eligibility reason and manual override.
21. `Dead Sea → Amman` direct drop → `POINT_TO_POINT`; same leg with vehicle retained
    for service → `HALF_DAY_SERVICE` (or `POINT_TO_POINT` + `HALF_DAY_SERVICE`) per contract.
22. A half-day **does not** count as a full package day by default (weight 0 unless half-day weighting enabled).
23. Half-day counts as **0.5** toward the minimum when `packageDayWeight` logic is enabled.
24. Two half-days collapse to **1.0** when `twoHalfDaysEqualFullDay`; each weighs **1.0**
    and bills full-day rate when `halfDayChargedAsFullDay`.
25. Quote builder shows, per half-day: P2P vs half-day service, the package-day weight,
    whether it counted toward the 3-day minimum, and whether it was billed as
    half-day / full-day / separate transfer / included.
26. P2P retention auto-presumption: same supplier+vehicle, consecutive days,
    out-of-base overnight → presumed retained (counts); direct drop + released → 0;
    planner override flips either way.
27. Base-city overnight: Amman-based supplier, night in Amman → **no** overnight; night
    in Petra → overnight applies; `baseCityOverride` shifts the base for that contract.
28. Airport leg with retained vehicle + sightseeing (QAIA→Madaba→Nebo→Dead Sea) →
    classified as touring/full-day (can count), not a 0-weight airport transfer.
29. Stationary rate fallback: city/area rate used when present, else flat class rate,
    else manual-required warning (no silent zero).

---

## 13. Phased PR plan

> Reuse the team's transport-branch + identical-PR-title convention. Each phase is
> shippable; new logic is inert/flagged until its dependencies land.

| PR | Scope | Gate / Risk |
|---|---|---|
| **0** | Vehicle-class audit: constants + alias map + **dry-run report** (no schema) | none |
| **1** | `Vehicle.vehicleClass` nullable + reviewed alias backfill + admin display | inert in pricing |
| **2** | `TransportContract` + regime/overnight/stationary enums + nullable FKs; **default ROUTE_TRANSFER backfill** | additive; behavior unchanged |
| **3** | Itinerary day classification (two axes) in **shadow mode** | no charge change |
| **4** | `minimumFullDays` enforcement + minimum-day policy + package eligibility | **must precede package activation** |
| **5** | Driver overnight first-class, **incl. per-vehicle mode**, city rates | **must precede package activation** |
| **6** | Stationary pricing — rates, city/area, counting & inclusion rules | flagged |
| **7** | Options resolver — route vs package, overnight, stationary; **shadow → surfaced**; recommended + manual | largest change; flagged |
| **8** | Admin UI — contract/regime editor, stationary rates, overnight policy, min-days/policy | + proxy routes |
| **9** | Seed cleanup (SUV, Large Bus X, stationary types) + **pilot package contract**; activate for pilot supplier | opt-in pilot |
| **10** | Retire temporary flags + overlapping `FULL_DAY`/`excursionPackageRate` package mechanisms | after parity |

**Sequencing rules:**
- Do **not** seed/activate `DAILY_PACKAGE` until PR 4.
- **PR 4 and PR 5 must land before** any package activation (PR 9).
- Existing route/transfer pricing **unchanged** after PR 2 backfill (test #1 is the gate).
- Package regime is **opt-in/pilot first**, then broadened.

---

## 14. Commercial decisions — ALL RESOLVED 2026-06-13

All six questions are answered; PR 4+ is unblocked.

1. **P2P retention** → auto-presume retained (counts 1.0) only when *same supplier +
   same vehicle across consecutive package days* **and** *group sleeps out-of-base or
   continues next day* **and** *vehicle stays with group*; or the leg sits inside a
   confirmed ≥`minimumFullDays` retained block. Direct drop + vehicle released = weight 0.
   **UI override always available.** (See two-axis model.)
2. **Airport transfers** → **separate by default** (`airportTransferIncluded = false`);
   included only per-contract. Airport+sightseeing+retained = touring/full-day, not a
   simple transfer. (See two-axis model "Airport classification".)
3. **Driver overnight** → **base-city-relative**; only out-of-base nights charge.
   `Supplier.baseCity` default + `TransportContract.baseCityOverride`. (See §1.7, §7.)
4. **Stationary pricing** → **both**; city/area override wins, else flat class rate,
   else manual-required warning. (See §8 resolution order.)
5. **Overnight on stationary** → **per out-of-base night, not per stationary day**;
   stationary triggers evaluation, charge only if out-of-base + not included/waived.
   (See §7, §8.)
6. **Half-day** → conservative; `halfDayCountsTowardMin = false`; never auto-counts;
   per-supplier-contract opt-in only. (See §6 "Confirmed default commercial logic".)
