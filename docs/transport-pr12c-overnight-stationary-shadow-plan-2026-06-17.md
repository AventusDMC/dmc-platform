# PR 12C — Driver-overnight + stationary/standby SHADOW calculation (plan only)

**Date:** 2026-06-17
**Status:** PLANNING ONLY — no code, no schema, no migration, no DB write, no PR.
**Builds on:** 12A audit, 12B-2 schema (`Supplier.baseCity`, `QuoteItineraryDay.overnightCity`,
`QuoteItineraryDay.vehicleReturnsToBase`), 12B-3A API capture, 12B-3B UI capture — all merged.
**Hard rule:** read-only diagnostic. `notApplied: true`. Never changes totals / QuoteItems /
pricing / contracts. Live-apply flag stays OFF; overnight/stationary stay blocked in live apply.

---

## 0. Grounding (what already exists in code)

- **`TransportContract`** already carries every field this PR needs (UNUSED today, schema comment
  says "exists but UNUSED until later PRs"): `baseCityOverride`, `driverOvernightPolicy`
  (enum `INCLUDED | SEPARATE | WAIVED`, default `SEPARATE`), `driverOvernightAmount`,
  `driverOvernightOnStationary`, `stationaryChargedSeparately`, `stationaryIncludedInPackage`,
  `stationaryCountsTowardMinDays`. **No schema change needed.**
- **Day classifier** (`apps/api/src/common/transport-day-classification.ts`) already emits
  `operationalType` including `STATIONARY_FULL_DAY | STATIONARY_HALF_DAY | STANDBY_WAITING |
  FREE_DAY_NO_VEHICLE` + `packageDayWeight` + retention. PR 12C consumes it, doesn't extend it.
- **Shadow service** (`package-eligibility-shadow.service.ts`) already loads quote days, maps them
  to classifier inputs, gathers per-day `{cost, sell, hasAddOn, nonRecalcItem, vehicles[]}` and
  resolves the PACKAGE contract. `evaluateQuotePackagePricingShadow` (GET
  `/transport-pricing/quotes/:id/package-pricing-shadow`, flag `transport.packagePricingShadowCompare`)
  is the natural host. It already pushes warnings `excludes-driver-overnight` and
  `stationary-not-priced-in-pr9`. **PR 12C fills exactly those two gaps, diagnostically.**
- **Add-on rate lookup already exists**: `TransportPricingService.findTransportAddOns({supplierId,
  vehicleId, paxCount, routeName, travelDate})` returns active `VehicleRate` rows whose
  `serviceType.classification = 'ADD_ON'`, then **text-matches** the name/routeName to tag
  `DRIVER_OVERNIGHT | STATIONARY_WAITING | OTHER` (`/overnight/`, `/stationary|waiting/`). City is
  matched by text (`petra|wadi rum|aqaba|outside amman`), NOT by a hard enum.
  > **IMPORTANT CORRECTION to the brief:** there are **no** `PETRA_OVERNIGHT / DEAD_SEA_OVERNIGHT /
  > WADI_RUM_OVERNIGHT / AQABA_OVERNIGHT` service-type *codes* in the system. Those are *names* of
  > ADD_ON `VehicleRate` rows (e.g. the "Petra Overnight" row from [[project_petra_overnight_fix_followup]]).
  > PR 12C must resolve overnight rates by reusing the existing ADD_ON text-match mechanism, not by a
  > non-existent enum. The plan treats the four city names as *match targets*, not codes.
- **Existing fold (T.5G)** ([[project_transport_addon_apply_t5g1a]]): `calculateTransportAddOnsForQuoteItem`
  already folds *explicitly-selected* ADD_ON rows (driver overnight per night, stationary) into the
  parent transport line's `baseCost` — qty = nights × vehicle. So a day may **already** carry an
  overnight/stationary charge. PR 12C must DETECT this and report overlap, never re-add it.
- **Live apply already fail-closes** on this surface: `computeQuotePackageLiveApply` blocks with
  `stationary-standby-present` (any STATIONARY/STANDBY day) and `addon-overnight-present` (any day
  with a `hasAddOn` line). PR 12C does NOT relax these — it only *explains* them in diagnostics.

---

## 1. Shadow calculation scope

A read-only, additive diagnostic block computing, **per day**, candidate (un-applied) charges for:
driver overnight, stationary full day, stationary half day, standby/waiting. Surfaced inside the
existing `package-pricing-shadow` response (see §8) with `notApplied: true`, contributing nothing to
`difference` / totals / selection. Purely informational; every value is paired with a `reason`/
`blocker` and an explicit rate `source`.

---

## 2. Driver-overnight business rules (per retained, vehicle-bearing day)

Resolved in order; first decisive outcome wins. `baseCity = contract.baseCityOverride ?? supplier.baseCity`.
All city comparisons use a normalized comparator (§ Risks): trim → lowercase → collapse
whitespace/punctuation; optional place-master canonicalization (`place-master-canonicalization.ts`)
as a second pass, fail-closed on ambiguity.

1. Day is not a retained/out-of-base candidate (free day, released vehicle, or no vehicle) → **no overnight** (`reason: not-applicable`).
2. `baseCity` missing (neither override nor supplier baseCity) → **block** (`blocker: base-city-missing`, manual-required).
3. `vehicleReturnsToBase === true` → **no charge** (`reason: returns-to-base`).
4. `overnightCity` missing on a retained out-of-base day → **block** (`blocker: overnight-city-missing`, manual-required).
5. `normalize(overnightCity) === normalize(baseCity)` → **no charge** (`reason: overnight-in-base-city`). *(Never charge base-city nights.)*
6. Out-of-base (`overnightCity !== baseCity`) and `vehicleReturnsToBase !== true` → evaluate by `driverOvernightPolicy`:
   - `INCLUDED` → no separate charge, `included: true` (`reason: policy-included`).
   - `WAIVED` → no charge, `waived: true` (`reason: policy-waived`).
   - `SEPARATE` → resolve rate (§3); rate found → `amount`, `separate: true`; rate missing/ambiguous → **block** (`blocker: overnight-rate-missing` / `overnight-rate-ambiguous`).
7. Stationary day + `driverOvernightOnStationary === false` → suppress the stationary-triggered overnight (`reason: overnight-on-stationary-disabled`).

Fail-closed everywhere: any uncertainty → block/manual-required, amount `0`, contributes nothing.

---

## 3. Driver-overnight rate lookup (fallback order, fail-closed)

For a day needing a `SEPARATE` charge, resolve in this order; stop at first unambiguous hit:

1. **City-specific ADD_ON `VehicleRate`** via the existing `findTransportAddOns({supplierId,
   vehicleId, paxCount, travelDate})` filtered to `addOnType === 'DRIVER_OVERNIGHT'` **and** whose
   name text matches `normalize(overnightCity)` (Petra / Dead Sea / Wadi Rum / Aqaba / etc.).
   - 0 matches → next step. **>1 distinct-price matches → block** `overnight-rate-ambiguous` (do not guess).
2. **Contract flat** `TransportContract.driverOvernightAmount` (if non-null).
3. **Supplier + vehicle-class generic** ADD_ON overnight rate (text match `overnight`, no city
   qualifier) for the day's vehicle/class. >1 distinct → block ambiguous.
4. **Capacity-unit mode**: only if the day's transport line itself prices in `capacity_unit` mode
   (per `transport-pricing.service.ts` rule) AND a capacity-unit ADD_ON rate exists → compute
   `unitCount = ceil(pax / unitCapacity)` × unit rate. If capacity-unit applicability is unclear →
   block `overnight-capacity-unit-ambiguous`.
5. None of the above → **block** `overnight-rate-missing` (manual-required).

`source` recorded as one of: `city-addon-rate` | `contract-flat` | `supplier-class-addon` |
`capacity-unit-addon`. Quantity for per-vehicle = nights (1 here, single night) × vehicle count,
mirroring T.5G fold semantics so a future live-apply matches the shadow.

---

## 4. Stationary / standby business rules (per day)

1. `FREE_DAY_NO_VEHICLE` or `vehicleReleased === true` → **no stationary charge** (`reason: no-vehicle`).
2. `operationalType`:
   - `STATIONARY_FULL_DAY` → stationary full-day candidate.
   - `STATIONARY_HALF_DAY` → stationary half-day candidate.
   - `STANDBY_WAITING` → standby/waiting candidate.
3. `stationaryIncludedInPackage === true` → no separate charge, `included: true` (`reason: stationary-included`).
4. Else if `stationaryChargedSeparately === true` → resolve stationary rate (ADD_ON
   `STATIONARY_WAITING` row for supplier+vehicle, full vs half distinguished by name text / a
   half-day factor when only a full rate exists — fail-closed if neither is determinable →
   block `stationary-rate-missing` / `stationary-half-day-undeterminable`).
5. `stationaryCountsTowardMinDays === true` → annotate the day's `packageDayWeight` contribution in
   diagnostics (display only; eligibility math is NOT re-run/altered here).
6. **No double-count:** if the stationary day is *also* a counted package full-day (its
   `packageDayWeight` already feeds the package full-day rate) → do NOT add a separate stationary
   charge; report `reason: covered-by-package-full-day` (warning `stationary-overlaps-package-day`).
7. Standby/waiting: same shape as stationary but tagged `standby`; uses the same ADD_ON
   `STATIONARY_WAITING` pool; missing → block.

Stationary is never priced live in 12C — diagnostic only.

---

## 5. Existing T.5G / overlap detection (warn/block, never alter totals)

PR 12C must detect and report, per day and at quote level:

- **Existing ADD_ON line on the day** (`hasAddOn === true`, already gathered) → for that day emit
  `blocker: existing-addon-on-day` and suppress any shadow overnight/stationary for it (the charge
  already exists in `baseCost`/as a line). Quote-level warning `addon-overnight-present` (mirrors
  live-apply block reason).
- **Overnight already folded into `baseCost`** (T.5G): not separately queryable as a line, so detect
  heuristically — if the day's persisted transport cost already exceeds the bare route/full-day card
  rate by ~an overnight amount, flag `warning: possible-folded-overnight` (advisory, never a silent
  charge). Conservative: when in doubt, warn rather than add.
- **`excursionPackageRate` overlap**: if `quote.excursionPackageRate === true`, the old
  free-mileage/package mechanism is active → quote-level `blocker: excursion-package-rate-overlap`
  (mirrors the existing live-apply `overlap-excursion-package-rate` gate); overnight/stationary shadow
  reported but flagged not-combinable.
- **Old ADD_ON behavior generally**: any day whose classification is stationary/standby AND already
  has an ADD_ON line → overlap blocker as above.

All of these set blockers/warnings; none change `difference` or totals.

---

## 6. Data requirements for the shadow calc

Per quote/day, must be present (else specific block):
- `Supplier.baseCity` (or `TransportContract.baseCityOverride`) — for overnight base comparison.
- `QuoteItineraryDay.overnightCity` — out-of-base detection.
- `QuoteItineraryDay.vehicleReturnsToBase` — charge suppression.
- `transportDayType` + classifier `operationalType` — stationary/standby/free/retained.
- `vehicleRetained` / `vehicleReleased` / `inRetainedBlock` — retention.
- Day vehicle(s) + supplierId + vehicleClass + currency (already gathered in `dayTransport`).
- Contract regime fields (§0) + `driverOvernightAmount`.
- ADD_ON rate availability (overnight + stationary) for supplier/vehicle/date — via existing lookup.
- pax/paxCount + `unitCapacity` for capacity-unit path.

Missing any required-for-a-charge field → that day blocks (manual-required), never silently 0-charges.

---

## 7. Diagnostic output format (additive, `notApplied: true`)

```jsonc
"overnightStationaryShadow": {
  "notApplied": true,
  "baseCityResolution": { "supplierBaseCity": "Amman", "contractOverride": null, "effectiveBaseCity": "Amman" },
  "overnightCharges": [
    {
      "dayNumber": 3, "overnightCity": "Petra", "baseCity": "Amman",
      "vehicleReturnsToBase": false, "policy": "SEPARATE",
      "outcome": "separate",            // included | waived | separate | no-charge | blocked
      "rateSource": "city-addon-rate",  // city-addon-rate | contract-flat | supplier-class-addon | capacity-unit-addon | null
      "amount": 45, "currency": "JOD",
      "reason": "out-of-base-petra", "blocker": null
    }
  ],
  "stationaryCharges": [
    {
      "dayNumber": 4, "type": "STATIONARY_FULL_DAY",
      "outcome": "separate",            // included | separate | no-charge | blocked
      "countsTowardMin": false, "packageDayWeightImpact": 0,
      "rateSource": "supplier-class-addon", "amount": 60, "currency": "JOD",
      "reason": "stationary-full-day", "blocker": null
    }
  ],
  "totalOvernightShadow": 45,
  "totalStationaryShadow": 60,
  "currency": "JOD",
  "blockers": ["..."],
  "warnings": ["addon-overnight-present", "stationary-overlaps-package-day"]
}
```

Totals are the sum of only **resolved `separate`** amounts; blocked/included/waived contribute 0.
Cross-currency days → block + currency surfaced; never silently sum mixed currencies.

---

## 8. Integration recommendation

**Recommended (safest): pure helper + additive read-only field on the EXISTING endpoint — no new endpoint.**
- **12C-1** — a pure function/helper (e.g. `apps/api/src/transport-pricing/overnight-stationary-shadow.ts`,
  `computeOvernightStationaryShadow(inputs): OvernightStationaryShadowResult`) taking already-loaded
  data (days, classifications, contract, supplier baseCity, ADD_ON rate snapshots). No I/O, fully
  unit-testable, imported nowhere at first (inert).
- **12C-2** — call it inside `evaluateQuotePackagePricingShadow` and attach the result as the new
  `overnightStationaryShadow` field on the response, behind the **existing** flag
  `transport.packagePricingShadowCompare` (no new flag). The rate-row reads reuse
  `TransportPricingService.findTransportAddOns` (inject the service, read-only). `quotes.service.ts`
  stays untouched; `computeQuotePackageLiveApply` stays untouched.

Why not a new endpoint: more surface, more auth wiring, and the data set is identical to the
pricing-shadow path. Why not extend the classifier/eligibility: those are shared by live apply —
keep 12C strictly out of any code path totals depend on. A pure helper guarantees zero total impact.

---

## 9. Tests (pure-helper unit tests, no DB)

- base city missing → overnight block.
- overnightCity missing on out-of-base retained day → block.
- `vehicleReturnsToBase = true` → no charge.
- overnight city == base city → no charge.
- out-of-base + SEPARATE + city ADD_ON rate exists → charge with `rateSource: city-addon-rate`.
- out-of-base + SEPARATE + only `driverOvernightAmount` → `rateSource: contract-flat`.
- INCLUDED → included, no amount.
- WAIVED → waived, no amount.
- SEPARATE + no rate anywhere → block `overnight-rate-missing`.
- SEPARATE + 2 distinct city rates → block `overnight-rate-ambiguous`.
- `driverOvernightOnStationary = false` on stationary day → overnight suppressed.
- stationary released vehicle / free day → no charge.
- stationary full day + `stationaryIncludedInPackage` → included.
- stationary full day + separate + rate exists → charge.
- stationary half day resolution (half rate or factor; undeterminable → block).
- standby/waiting resolution.
- `stationaryCountsTowardMinDays` → `packageDayWeightImpact` annotated, eligibility unchanged.
- stationary day that is also a counted package full-day → `covered-by-package-full-day`, no double-count.
- existing ADD_ON line on day (`hasAddOn`) → overlap blocker, no shadow charge added.
- `excursionPackageRate = true` → quote-level overlap blocker.
- cross-currency day → block, no mixed sum.
- **invariants:** result is `notApplied: true`; helper performs no writes; totals/`difference`
  in the surrounding pricing-shadow response are byte-identical with vs without the new block
  (regression test on `evaluateQuotePackagePricingShadow`).
- source-grep / existing pricing-shadow tests remain green; `quotes.service.ts` untouched.

---

## 10. Recommended PR split

- **PR 12C-1** — pure shadow helper + unit tests (inert; imported nowhere). *(this is the next build step)*
- **PR 12C-2** — surface `overnightStationaryShadow` on `package-pricing-shadow` behind the existing
  shadow flag; inject `TransportPricingService` read-only; response/integration tests.
- **PR 12D** — admin-web read-only diagnostic display (preview panel), if useful, flag-gated like PR10A.
- **PR 12E** — controlled validation on throwaway test quotes (in-process flag, reversible), like 11B-3D.
- **PR 12F** — live apply behind flag + allowlist; fold/reconcile with T.5G overnight/stationary
  (retire the T.5G `baseCost` fold OR make them mutually exclusive) so no double-charge; total-level
  delta only, no QuoteItem mutation (same shape as 11A).
- **PR 13** — retire `excursionPackageRate` overlap mechanism.

---

## 11. Risks

- **Free-text city mismatch** ("Wadi Rum" vs "WadiRum" vs "wadi rum" vs "Petra (Wadi Musa)") — wrong
  match → wrong/again-zero charge. Mitigation: strict normalized comparator + optional place-master
  canonicalization; ambiguous → block, never guess.
- **Missing base city** across most suppliers (12B just *enabled* capture; most rows still NULL) →
  most days will block as `base-city-missing`. Expected initially; the diagnostic makes the data gap
  visible. Not an error.
- **Alpha missing overnight/stationary ADD_ON rates** (per audit history) → many `*-rate-missing`
  blocks. Surface, don't fabricate.
- **Stationary rate ambiguity** (full vs half, standby vs stationary text) → fail-closed block.
- **Capacity-unit ambiguity** — only apply capacity-unit path when the day's line is genuinely
  capacity-unit; otherwise block.
- **Double-counting** — stationary vs package full-day, and overnight vs T.5G fold. Mitigation:
  overlap detection (§5) + `covered-by-package-full-day` + suppress on `hasAddOn`.
- **T.5G / old ADD_ON overlap** — day may already carry a folded overnight; warn, never re-add.
- **Accidental live total change** — mitigated structurally: pure helper, additive field,
  `notApplied: true`, `quotes.service.ts` + live-apply untouched, byte-identical-totals regression test.

---

## Acceptance criteria (for the eventual 12C-1/2 implementation; this doc = plan only)

1. New pure helper computes per-day overnight + stationary/standby candidate charges following §2/§4,
   resolving rates per §3, with the §7 output shape and `notApplied: true`.
2. Every charge carries an explicit `rateSource` or a `blocker`; all uncertainty fails closed.
3. Surfaced only on the existing `package-pricing-shadow` GET behind the existing shadow flag; **no
   new endpoint, no new flag**.
4. `package-pricing-shadow` `difference`/totals and `computeQuotePackageLiveApply` are unchanged
   (regression-proven); `quotes.service.ts` untouched.
5. No schema/migration/DB write/quote mutation/contract change; live-apply flag OFF; overnight/
   stationary remain blocked in live apply.
6. Overlap with T.5G fold / `excursionPackageRate` / existing ADD_ON lines is detected and reported,
   never double-charged.
7. Full §9 test suite passes; `proposal-v3-pdf-export.test.ts` excluded; quote-WIP stash + dana untouched.

## Out of scope
12D UI, 12E validation, 12F live apply, PR 13 retirement, any production activation, any schema work.
