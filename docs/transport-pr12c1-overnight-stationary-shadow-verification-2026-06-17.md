# PR 12C-1 — Overnight/stationary shadow helper: Verification

**Date:** 2026-06-17
**Branch:** `transport-pr12c1-overnight-stationary-shadow` (from `origin/main`)
**Scope:** a PURE, INERT diagnostic helper computing candidate driver-overnight + stationary/standby
charges. No I/O, no DB, no writes, no wiring. `notApplied: true`. **Imported nowhere in live code.**

## What shipped
- **`apps/api/src/transport-pricing/overnight-stationary-shadow.ts`** — pure
  `computeOvernightStationaryShadow(input)` + exported types. Only dependency is a **type-only**
  import of `OperationalTransportType` from `transport-day-classification.ts` (no runtime coupling).
- **`apps/api/src/transport-pricing/overnight-stationary-shadow.test.ts`** — 30 unit tests.

## Business rules implemented (approved 2026-06-17)
- `baseCity = contract.baseCityOverride ?? supplierBaseCity`; missing → blocker `base-city-missing`.
- `vehicleReturnsToBase === true` → no overnight charge (`returns-to-base`).
- Missing `overnightCity` on an out-of-base candidate → blocker `overnight-city-missing`.
- `normalize(overnightCity) === normalize(baseCity)` → no charge (`overnight-in-base-city`); never
  charge base-city nights. City normalization: trim → lowercase → strip non-alphanumerics.
- Policy: `INCLUDED` → included; `WAIVED` → waived; `SEPARATE` → rate or blocker.
- `driverOvernightOnStationary === false` suppresses overnight on stationary days.
- Stationary: released/free → no charge; `stationaryIncludedInPackage` → included;
  `stationaryChargedSeparately` → rate or blocker; `stationaryCountsTowardMinDays` → annotate
  `packageDayWeightImpact` only (no eligibility change); counted-package-full-day → no separate
  charge (`covered-by-package-full-day` + warning). Half day requires a half rate else
  `stationary-half-day-undeterminable`.
- Overlaps (warnings/blockers only, never a charge): existing ADD_ON line → `existing-addon-on-day`
  + `addon-overnight-present`; `possibleFoldedOvernight` → `possible-folded-overnight` warning;
  `excursionPackageRate` → quote-level `excursion-package-rate-overlap` blocker.

## Rate lookup (fail-closed fallback)
1. city-specific ADD_ON rate (text-match the rate label to the overnight city) →
2. contract flat `driverOvernightAmount` → 3. supplier/class generic ADD_ON → 4. capacity-unit
(only when the day is genuinely capacity-unit; `units = ceil(pax/unitCapacity)`) → 5. block
`overnight-rate-missing`. Multiple distinct prices at any step → block `*-ambiguous`. Resolved
currency ≠ quote currency → block `*-cross-currency`. **No PETRA_OVERNIGHT-style enum codes** —
city/half-day matching is by rate-label text, consistent with the existing ADD_ON mechanism.

## Output shape
`{ notApplied:true, baseCityResolution, overnightCharges[], stationaryCharges[], totalOvernightShadow,
totalStationaryShadow, currency, blockers[], warnings[] }`. Totals sum **only** `outcome:'separate'`
amounts; included/waived/blocked/no-charge contribute 0.

## Tests — 30 pass
base-city-missing block · overnight-city-missing block · returns-to-base no-charge · in-base no-charge
· baseCityOverride wins · city ADD_ON charge · wrong-city falls through · contract-flat fallback ·
supplier-class fallback · capacity-unit gating + math · INCLUDED · WAIVED · missing-rate block ·
ambiguous block · cross-currency block · driverOvernightOnStationary=false suppress · stationary
released no-charge · stationary included · stationary separate charge · half-day (half rate / only-full
block) · standby · stationary missing-rate block · countsTowardMin annotate-only · no double-count vs
package full-day · existing-addon overlap + warning · possible-folded warning · excursionPackageRate
blocker · notApplied + totals · no-mutation (input JSON unchanged) · empty quote.
Runner: `node --test --require ts-node/register <file>`.

## Confirmations
- **Inert** — `grep` confirms the helper is imported only by its own test; nowhere in live code.
- **No wiring** — `package-eligibility-shadow.service.ts`, `quotes.service.ts`, controllers, and
  `computeQuotePackageLiveApply` are all untouched. PR 12C-2 (integration) NOT started.
- **No pricing/quote behavior change** — helper does no I/O and is not invoked by any pricing path;
  `notApplied: true`; performs no writes (asserted).
- **No schema / migration / DB write / contract / flag change.**
- `nest build` passes (compiles `*.test.ts` too).
- No unrelated files — `proposal-v3-pdf-export.test.ts` left modified-but-uncommitted (excluded);
  quote-WIP stash + dana untouched.

## Files
- `apps/api/src/transport-pricing/overnight-stationary-shadow.ts`
- `apps/api/src/transport-pricing/overnight-stationary-shadow.test.ts`
- `docs/transport-pr12c-overnight-stationary-shadow-plan-2026-06-17.md` (plan, from prior step)
- this verification

## Out of scope (unchanged)
12C-2 integration; 12D UI; 12E validation; 12F live apply; PR 13; any production activation; any
schema work.
