# PR 12C-2 — Wire overnight/stationary shadow into package-pricing-shadow (plan only)

**Date:** 2026-06-17
**Status:** PLANNING ONLY — no code, no schema, no migration, no DB write, no flag, no PR.
**Builds on:** PR 12C-1 (merged) — pure `computeOvernightStationaryShadow` helper, currently inert.
**Hard rule:** additive, diagnostic-only. The new object is `notApplied: true`, is **not** summed
into any total, and changes **no** existing comparison number. Live apply
(`computeQuotePackageLiveApply`) and `quotes.service.ts` stay untouched. Live-apply flag stays OFF.

---

## 0. Grounding (exact current code)

- Host method: `PackageEligibilityShadowService.evaluateQuotePackagePricingShadow(quoteId)`
  (`apps/api/src/transport-pricing/package-eligibility-shadow.service.ts:333`), gated by
  `isPackagePricingShadowCompareEnabled()` (flag `transport.packagePricingShadowCompare`, default
  OFF). Returns an object that already ends with `..., allowlist, notApplied: true }` (line ~540).
- Endpoint: `GET /transport-pricing/quotes/:id/package-pricing-shadow`
  (`transport-pricing.controller.ts:109`, `@Roles('admin','finance')`), returns
  `{ enabled: true, ...result }`. **No new endpoint needed.**
- Day `select` (lines 340-355) currently pulls `dayNumber, transportDayType, vehicleRetained,
  vehicleReleased, inRetainedBlock` + dayItems (serviceType `code`/`classification`, vehicle
  `id/name/vehicleClass/resolvedSupplierId`, supplierId, cost fields). It does **NOT** yet pull
  `overnightCity` / `vehicleReturnsToBase` → PR 12C-2 must add those two scalars to the select.
- `contractRow = transportContract.findFirst(...)` returns the **full** row → already carries
  `baseCityOverride, driverOvernightPolicy, driverOvernightAmount, driverOvernightOnStationary,
  stationaryChargedSeparately, stationaryIncludedInPackage, stationaryCountsTowardMinDays, currency`.
  No extra contract query needed.
- Supplier load (line 409) currently selects only `transportDiscountPercent` → add `baseCity`.
- `quote.findUnique` is already called for `quoteCurrency` (line 511) → extend to also read
  `excursionPackageRate`, `adults`, `children` (pax for capacity-unit). (Or one consolidated read.)
- `adjustedDays` (classifier output, line 402) already provides per-day `operationalType`,
  `packageDayWeight`, `countsAsFullPackageDay`; `eligibility.eligible` is known. `dayVehicles`
  (line 505) already lists per-day transport vehicles/suppliers. These feed the helper input.
- ADD_ON lookup already exists: `TransportPricingService.findTransportAddOns({supplierId, vehicleId,
  paxCount, routeName, travelDate})` → returns active ADD_ON `VehicleRate` rows tagged
  `DRIVER_OVERNIGHT | STATIONARY_WAITING | OTHER` with `name`, `unitCost`, `currency`, `unitCapacity`.
- **Constructor caveat:** `package-eligibility-shadow.service.test.ts` constructs the service with a
  **single** arg (`new PackageEligibilityShadowService(fakePrisma(...))`). Any new dependency MUST be
  an **optional** ctor arg or those tests break (same lesson as the PR 11A optional-6th-arg pattern).

---

## 1. Integration point

Inside `evaluateQuotePackagePricingShadow`, **after** all existing fields are computed (so none are
reordered or altered), build a `OvernightStationaryInput` from already-loaded data, call
`computeOvernightStationaryShadow(...)`, and add the result as a single new key on the existing
return object:

```ts
return { quoteId, ..., allowlist, overnightStationaryShadow, notApplied: true };
```

- No new endpoint. Same flag (`transport.packagePricingShadowCompare`) — when OFF, the whole method
  already returns `null` and the controller returns `{ enabled:false }`, so the new block is never
  produced.
- The helper import is added **only** to this shadow path. It is **not** imported by
  `computeQuotePackageLiveApply` or `quotes.service.ts`.

---

## 2. Data mapping (existing shadow data → helper input)

| Helper input | Source in `evaluateQuotePackagePricingShadow` |
|---|---|
| `supplierBaseCity` | `supplier.findUnique(... select baseCity)` for `primary.supplierId` (extend the existing supplier select) |
| `contract.baseCityOverride` | `contractRow.baseCityOverride` |
| `contract.driverOvernightPolicy` | `contractRow.driverOvernightPolicy` |
| `contract.driverOvernightAmount` | `contractRow.driverOvernightAmount` |
| `contract.driverOvernightOnStationary` | `contractRow.driverOvernightOnStationary` |
| `contract.stationaryChargedSeparately` | `contractRow.stationaryChargedSeparately` |
| `contract.stationaryIncludedInPackage` | `contractRow.stationaryIncludedInPackage` |
| `contract.stationaryCountsTowardMinDays` | `contractRow.stationaryCountsTowardMinDays` |
| `contract.currency` | `contractRow.currency` |
| `quoteCurrency` | already loaded (`quote.quoteCurrency`) |
| `excursionPackageRate` | extend the quote read (`quote.excursionPackageRate`) |
| per-day `operationalType` | `adjustedDays[i].operationalType` |
| per-day `packageDayWeight` | `adjustedDays[i].packageDayWeight` |
| per-day `countedAsPackageFullDay` | `eligibility.eligible && adjustedDays[i].countsAsFullPackageDay === true` |
| per-day `vehicleRetained/vehicleReleased/inRetainedBlock` | rawDays metadata (already selected) |
| per-day `overnightCity` / `vehicleReturnsToBase` | **add to the day `select`** |
| per-day `hasVehicle` | `dayVehicles[i].length > 0` |
| per-day `hasExistingAddOn` | any transport line on the day with `serviceTypeClassification === 'ADD_ON'` (already in the item select) |
| per-day `currency` | resolved transport line currency if available, else contract/quote currency |
| per-day `pax` | `quote.adults + quote.children` (extend quote read) |
| per-day `isCapacityUnitDay` | **conservative `false` in 12C-2** (see §3) |
| per-day `overnightRateCandidates` / `stationaryRateCandidates` | from the ADD_ON lookup (§3) |

`contract` is `null` when no PACKAGE contract resolves → the helper still runs and reports
`base-city-missing` / policy defaults; that is fine (diagnostic).

---

## 3. ADD_ON reuse (read-only, fail-closed)

**Reuse `findTransportAddOns` via an OPTIONAL injected `TransportPricingService`** (2nd ctor arg,
defaulted) so existing single-arg test construction still compiles. For each distinct
`(supplierId, vehicleId)` among overnight/stationary-relevant days, call once (deduped),
`paxCount = adults+children`, `travelDate = quote.travelStartDate ?? now()`, then map rows to the
helper's `OvernightStationaryRateCandidate[]`:

- `addOnType === 'DRIVER_OVERNIGHT'` → overnight candidate. `source` = `'city-addon-rate'` when the
  row `name` looks city-specific (contains a city token: petra | dead sea | wadi rum | aqaba | …),
  else `'supplier-class-addon'`. Pass `name` so the helper confirms it matches **this day's**
  `overnightCity`. (No new enum codes — name text only, per the accepted 12C-1 correction.)
- `addOnType === 'STATIONARY_WAITING'` → stationary candidate; `halfDay: /half/i.test(name)`.
- `OTHER` → ignored.
- `currency` carried from each row → helper blocks cross-currency vs `quoteCurrency`.

**Fail-closed rules (all already enforced by the 12C-1 helper):** missing → block `*-rate-missing`;
>1 distinct price → block `*-ambiguous`; currency ≠ quote currency → block `*-cross-currency`.

**Capacity-unit:** reliably detecting that a day's transport line prices in `capacity_unit` mode is
non-trivial here (needs the pricing rule, not loaded by this method). For 12C-2, set
`isCapacityUnitDay = false` (conservative) so the capacity-unit path is never taken — such days fall
through to `overnight-rate-missing` (a safe, visible block). Real capacity-unit overnight pricing is
deferred to a later PR. **Document this limitation explicitly in the response/warnings.**

> Alternative if the optional injection causes a circular DI (TransportPricingService ↔ shadow
> service): replicate the same read-only `vehicleRate.findMany({ classification:'ADD_ON', active,
> validFrom/validTo, supplierId, vehicleId })` query inline in the shadow service (no ctor change).
> Same data, same fail-closed mapping. Decide at implementation after checking the module graph.

---

## 4. Response shape (additive, backward-compatible)

A single new key on the existing `package-pricing-shadow` result (the exact 12C-1 helper output):

```jsonc
"overnightStationaryShadow": {
  "notApplied": true,
  "baseCityResolution": { "supplierBaseCity": "Amman", "contractOverride": null, "effectiveBaseCity": "Amman" },
  "overnightCharges": [ { "dayNumber": 3, "overnightCity": "Petra", "baseCity": "Amman", "vehicleReturnsToBase": false, "policy": "SEPARATE", "outcome": "separate", "rateSource": "city-addon-rate", "amount": 45, "currency": "JOD", "reason": "out-of-base", "blocker": null } ],
  "stationaryCharges": [ { "dayNumber": 4, "type": "STATIONARY_FULL_DAY", "outcome": "separate", "countsTowardMin": false, "packageDayWeightImpact": 0, "rateSource": "supplier-class-addon", "amount": 60, "currency": "JOD", "reason": "stationary", "blocker": null } ],
  "totalOvernightShadow": 45,
  "totalStationaryShadow": 60,
  "currency": "JOD",
  "blockers": [ "..." ],
  "warnings": [ "capacity-unit-overnight-not-evaluated-in-12c2", "..." ]
}
```

Rules (all enforced structurally):
- Diagnostic only; **not** added to `currentTransportTotal`, `packageGrossTotal`, `packageNetTotal`,
  `packageCandidateTotal`, `difference`, or any other existing field.
- `totalOvernightShadow` / `totalStationaryShadow` live **only** inside this object.
- All existing keys keep their exact names, types, and values → backward-compatible.
- Add one warning noting the 12C-2 capacity-unit limitation (so the gap is visible, not silent).

---

## 5. Blocker / warning behavior

- Helper blockers/warnings stay **inside** `overnightStationaryShadow.blockers` / `.warnings`.
- They do **not** feed `packageEligible`, `eligibility`, `selectionStale`, `allowlist`, or any
  existing field. Eligibility math is unchanged.
- Live apply is unchanged: `computeQuotePackageLiveApply` still blocks
  `stationary-standby-present` / `addon-overnight-present` exactly as today. Overnight/stationary stay
  **not applied** in live pricing; this PR only *explains* them.
- The pre-existing top-level `warnings` array (e.g. `excludes-driver-overnight`,
  `stationary-not-priced-in-pr9`) is left as-is for backward-compat (the richer detail now lives in
  the new object).

---

## 6. Invariants to prove

1. **Existing totals byte-identical** — the existing `package-eligibility-shadow.service.test.ts`
   suite (which asserts `currentTransportTotal`, `packageNetTotal`, `difference`, eligibility, etc.)
   passes **unchanged** (we add no assertions to it and change no existing numbers). This is the
   primary proof that totals didn't move.
2. **New block is purely additive** — a test asserting that deleting `overnightStationaryShadow` from
   the response leaves an object whose existing keys/values match the pre-12C-2 expectation.
3. **No quote total / QuoteItem change** — method does only `findMany`/`findUnique`/`findFirst`
   (reads); no `update`/`create`/`delete`/`$transaction`. Assert via code review + a grep test that
   the shadow path performs no Prisma writes.
4. **No DB writes** — same as (3); the helper is pure.
5. **Live apply does not import/call the helper** — grep test: `computeQuotePackageLiveApply`'s body
   and `quotes.service.ts` contain no reference to `computeOvernightStationaryShadow`.
6. **`computeQuotePackageLiveApply` untouched** — diff shows no change to that method.
7. **`quotes.service.ts` untouched** — empty diff.

---

## 7. Tests (integration, fake-prisma — same harness as existing shadow tests)

- `package-pricing-shadow` response includes `overnightStationaryShadow` (flag ON).
- the object has `notApplied: true`.
- out-of-base + SEPARATE + city ADD_ON rate present → an `overnightCharges` entry `outcome:'separate'`.
- missing supplier baseCity (and no override) → overnight diagnostic blocker `base-city-missing`.
- missing `overnightCity` on an out-of-base day → blocker `overnight-city-missing`.
- `vehicleReturnsToBase = true` → `no-charge` diagnostic.
- stationary full-day + separate + rate → `stationaryCharges` entry `outcome:'separate'`.
- stationary included (`stationaryIncludedInPackage`) → `outcome:'included'`, no separate charge.
- existing ADD_ON line on day → diagnostic blocker `existing-addon-on-day` + warning
  `addon-overnight-present`.
- **no existing total changed** — assert `currentTransportTotal`/`packageNetTotal`/`difference`
  equal the values from the matching existing-suite fixture, with vs without the new block.
- **no QuoteItem mutation / no DB write** — fake prisma records zero write calls.
- **helper not imported by live apply** — static grep test.
- **response backward-compatible** — all pre-existing keys still present with same types.
- existing `package-eligibility-shadow.service.test.ts` suite still green, unchanged.

---

## 8. File list (exact)

**Edit:**
- `apps/api/src/transport-pricing/package-eligibility-shadow.service.ts`
  - extend day `select` (+`overnightCity`, +`vehicleReturnsToBase`), supplier select (+`baseCity`),
    quote read (+`excursionPackageRate`, +`adults`, +`children`);
  - optional ctor arg `TransportPricingService` (or inline read-only ADD_ON query);
  - build helper input, call `computeOvernightStationaryShadow`, add `overnightStationaryShadow` to
    the return object. Import the 12C-1 helper here (shadow path only).
- `apps/api/src/transport-pricing/transport-pricing.module.ts` — only if wiring the optional
  `TransportPricingService` injection requires a providers/exports tweak (verify the module graph;
  no change if inline-query route is chosen).

**Add:**
- `apps/api/src/transport-pricing/package-pricing-shadow-overnight.test.ts` (new integration tests)
  *(or extend the existing shadow test file additively — TBD at impl; new file preferred to avoid
  source-grep fragility on the existing suite).*
- `docs/transport-pr12c2-...-plan-2026-06-17.md` (this) + a PR 12C-2 verification doc.

**Must NOT include:** `quotes.service.ts`, schema/migrations, any admin-web UI,
`QuoteServicePlanner`, `QuoteItemCard`, `computeQuotePackageLiveApply` logic changes,
`proposal-v3-pdf-export.test.ts`.

---

## 9. Risks

- **Accidental total change** — mitigated: compute the block last, add one key only, and keep the
  existing shadow suite unchanged & green (invariant 1).
- **Accidental live-apply import** — mitigated: import the helper only in the shadow method; grep
  test that live apply / `quotes.service.ts` never reference it.
- **ADD_ON ambiguity / mixed currency** — handled by the 12C-1 helper (block ambiguous/cross-currency).
- **Free-text city mismatch** — handled by the helper's normalized comparator; ambiguous → block.
- **Supplier `baseCity` still NULL for most suppliers** — expected; produces `base-city-missing`
  blockers (visible, not an error). Makes the data gap measurable.
- **T.5G folded-cost overlap** — surfaced as `existing-addon-on-day` blocker + `addon-overnight-present`
  / `possible-folded-overnight` warnings; never re-charged.
- **`excursionPackageRate` overlap** — quote-level blocker, never combined.
- **Response payload growth** — bounded (one object, arrays sized to itinerary days); acceptable for
  an admin/finance diagnostic endpoint.
- **Capacity-unit gap** — 12C-2 conservatively does not evaluate capacity-unit overnight (blocks
  instead); documented via a warning. No silent under-charge.
- **DI circular dependency** — possible with `TransportPricingService` injection; fallback = inline
  read-only ADD_ON query (no ctor change). Decide after checking the module graph.
- **Source-grep fragility** — keep changes additive; prefer a new test file over editing the
  existing shadow suite's asserted fixtures.

---

## 10. Acceptance criteria

1. `package-pricing-shadow` response gains an additive `overnightStationaryShadow` object
   (`notApplied: true`) behind the existing shadow flag.
2. All existing totals/comparison fields (`currentTransportTotal`, `packageGrossTotal`,
   `packageNetTotal`, `packageCandidateTotal`, `difference`, eligibility, `allowlist`,
   `savedSelection`, `selectionStale`) are unchanged.
3. No quote totals change; no QuoteItem mutation; no DB writes; no schema/migration; no UI.
4. No live pricing; `computeQuotePackageLiveApply` behavior/logic unchanged; overnight/stationary
   remain blocked/warning-only in live apply; production live-apply flag stays OFF.
5. Helper imported only by the shadow path (and its own test) — never by live apply or
   `quotes.service.ts`.
6. New + existing tests pass; `nest build` passes; `proposal-v3-pdf-export.test.ts` excluded;
   quote-WIP stash + dana untouched.
7. PR 12D / 12E / 12F / PR 13 not started.

## Out of scope
12D UI; 12E controlled validation; 12F live apply; PR 13 retirement; any production activation;
any schema work; any live-apply or `quotes.service.ts` change.
