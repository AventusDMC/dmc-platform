# PR 12C-2 — Overnight/stationary shadow integration: Verification

**Date:** 2026-06-17
**Branch:** `transport-pr12c2-overnight-stationary-shadow-integration` (from `origin/main`)
**Scope:** wire the inert PR 12C-1 `computeOvernightStationaryShadow` helper into
`evaluateQuotePackagePricingShadow` as an additive, read-only `overnightStationaryShadow` field.
**Diagnostic only — no live pricing, no total changes, no writes.**

## What shipped
- `apps/api/src/transport-pricing/package-eligibility-shadow.service.ts`
  - Import the 12C-1 helper (shadow path only).
  - Pricing-shadow day `select` extended with `overnightCity` + `vehicleReturnsToBase`.
  - New private `computeOvernightStationaryDiagnostic(...)` builds the helper input from
    already-loaded `rawDays`/`days`/`adjustedDays`/`dayVehicles`/`contractRow`, plus read-only
    `supplier.findUnique(baseCity)`, `quote.findUnique(adults/children/excursionPackageRate/
    travelStartDate/quoteCurrency)`, and an inline read-only `vehicleRate.findMany` ADD_ON lookup.
  - `evaluateQuotePackagePricingShadow` computes it **after** every existing field and adds one new
    key: `overnightStationaryShadow` (before `notApplied: true`).
- `apps/api/src/transport-pricing/package-pricing-shadow-overnight.test.ts` — 12 integration tests.

## Design decisions (as approved)
- **No new endpoint / no new flag** — uses the existing `package-pricing-shadow` GET and the existing
  `transport.packagePricingShadowCompare` flag.
- **Inline read-only ADD_ON lookup** (not DI of `TransportPricingService`) — there is no
  `transport-pricing.module.ts`; the service is provided in `app.module.ts` and its tests construct
  it with a single ctor arg. Inline `vehicleRate.findMany` avoids any ctor change / DI / circular
  risk. It mirrors `findTransportAddOns`' filter (active, validFrom/validTo, supplierId+vehicleId,
  `serviceType.classification = 'ADD_ON'`) and maps rows to the helper's candidate shape (overnight
  vs stationary by name text; `city-addon-rate` when the label contains a city token, else
  `supplier-class-addon`; `halfDay` by `/half/`). **No new enum codes.**
- **All new reads are optional-chained** (`this.prisma.vehicleRate?.findMany?.(...)`,
  `supplier?.findUnique?.`, `quote?.findUnique?.`) so the existing read-only fake-prisma harnesses
  (which don't define `vehicleRate`) don't throw → those tests stay green and missing data fails
  closed in the helper.
- **Capacity-unit deferral** — `isCapacityUnitDay` is hard-set `false`; capacity-unit overnight is
  never priced here (fail-closed block), and a `capacity-unit-overnight-not-evaluated-in-12c2`
  warning is added so the gap is visible, not silent.

## Invariants proven
- **Existing shadow suite (`package-eligibility-shadow.service.test.ts`) — 77/77 pass, unchanged.**
  This is the primary proof that `currentTransportTotal` / `packageNetTotal` / `difference` /
  eligibility / `allowlist` math did not move.
- New test asserts existing comparison fields (`currentTransportTotal`, `packageGrossTotal`,
  `packageNetTotal`, `packageCandidateTotal`, `difference`, `packageEligible`,
  `countedFullPackageDays`, `fullDayCount`, `halfDayCount`) are **identical** with vs without
  overnight data on the days — the new block is purely additive.
- New test asserts deleting `overnightStationaryShadow` leaves a backward-compatible response.
- Read-only fake wires `create/update/delete/$transaction` to throw → a successful run proves
  **no DB writes**.
- Static test asserts the live-apply method (`computeQuotePackageLiveApply` onwards) contains no
  `OvernightStationary` reference, and `quotes.service.ts` neither imports nor calls the helper.

## Tests — 12 pass (new) + 77 pass (existing, unchanged); `nest build` passes
response includes `overnightStationaryShadow` · `notApplied:true` · out-of-base separate city-rate
charge · missing base city blocker · missing overnight city blocker · returns-to-base no-charge ·
stationary full-day separate charge · stationary included · existing-ADD_ON overlap blocker+warning ·
existing totals identical (additive) · backward-compatible after key removal · no DB writes ·
helper-not-in-live-apply / quotes.service untouched.
Runner: `node --test --require ts-node/register`.

## Sample response excerpt (overnight day to Petra, SEPARATE, "Petra Overnight" 45 JOD)
```jsonc
{
  "currentTransportTotal": 300, "packageNetTotal": 225, "difference": -75, "packageEligible": true,
  "allowlist": { /* unchanged */ },
  "overnightStationaryShadow": {
    "notApplied": true,
    "baseCityResolution": { "supplierBaseCity": "Amman", "contractOverride": null, "effectiveBaseCity": "Amman" },
    "overnightCharges": [ { "dayNumber": 1, "overnightCity": "Petra", "baseCity": "Amman", "vehicleReturnsToBase": false, "policy": "SEPARATE", "outcome": "separate", "rateSource": "city-addon-rate", "amount": 45, "currency": "JOD", "reason": "out-of-base", "blocker": null } ],
    "stationaryCharges": [],
    "totalOvernightShadow": 45, "totalStationaryShadow": 0, "currency": "JOD",
    "blockers": [], "warnings": ["capacity-unit-overnight-not-evaluated-in-12c2"]
  },
  "notApplied": true
}
```
The overnight 45 lives only inside `overnightStationaryShadow`; it is NOT in `currentTransportTotal`,
`packageNetTotal`, or `difference`.

## Confirmations
- Existing package totals/comparison fields unchanged; helper totals live only inside the new object.
- No quote total change, no QuoteItem mutation, no DB writes, no schema/migration, no UI.
- Live apply unchanged — `computeQuotePackageLiveApply` not touched; overnight/stationary remain
  blocked/warning-only in live apply; production live-apply flag OFF.
- Helper imported only by the package-shadow path and its tests; not by live apply or
  `quotes.service.ts` (empty diff there).
- No contract/flag change. No unrelated files (`proposal-v3-pdf-export.test.ts` excluded; quote-WIP
  stash + dana untouched). PR 12D / 12E / 12F / PR 13 not started.

## Files
- `apps/api/src/transport-pricing/package-eligibility-shadow.service.ts`
- `apps/api/src/transport-pricing/package-pricing-shadow-overnight.test.ts`
- `docs/transport-pr12c2-overnight-stationary-shadow-integration-plan-2026-06-17.md` + this verification

## Out of scope (unchanged)
12D UI; 12E controlled validation; 12F live apply; PR 13 retirement; any production activation; any
schema work; any live-apply or `quotes.service.ts` change.
