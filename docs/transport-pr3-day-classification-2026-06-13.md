# PR 3 — Itinerary Transport Day-Classification (SHADOW MODE)

**Date:** 2026-06-13
**Branch:** `transport-contract-regime-pr3` (from current `origin/main`)
**Module:** `apps/api/src/common/transport-day-classification.ts` (pure, **imported nowhere**)

PR 3 adds the two-axis day-classification model that future package eligibility (PR 4+)
will consume. **Classify only** — it does not price, enforce minimum days, charge
overnight, choose a supplier, or change any quote total. The module is inert; no pricing
or quote code imports it.

## The two axes
- **Axis 1 — operational type:** `AIRPORT_TRANSFER, POINT_TO_POINT, TOURING_ROUTE,
  FULL_DAY_SERVICE, HALF_DAY_SERVICE, STATIONARY_FULL_DAY, STATIONARY_HALF_DAY,
  STANDBY_WAITING, FREE_DAY_NO_VEHICLE`.
- **Axis 2 — package weighting:** `packageDayWeight` (0 / 0.5 / 1), `countsAsFullPackageDay`
  (weight ≥ 1), `countsTowardMinimum` (weight > 0), `billedAs`
  (`full-day | half-day | separate-transfer | stationary | standby | free | manual-required`),
  plus diagnostics `vehicleRetained`, `retentionReason`, `retentionCandidate`.

## Locked rules encoded
| Operational type | Weight | billedAs |
|---|---|---|
| TOURING_ROUTE / FULL_DAY_SERVICE | 1.0 | full-day |
| POINT_TO_POINT — retained | 1.0 | full-day |
| POINT_TO_POINT — released / lone | 0 | separate-transfer |
| POINT_TO_POINT — adjacency candidate only | 0 | **manual-required** |
| AIRPORT_TRANSFER — default | 0 | separate-transfer |
| AIRPORT_TRANSFER — contract-included | 1.0 | full-day |
| HALF_DAY_SERVICE — default | 0 | half-day |
| HALF_DAY_SERVICE — `halfDayCountsTowardMin` | 0.5 | half-day |
| HALF_DAY_SERVICE — `halfDayChargedAsFullDay` | 1.0 | full-day |
| STATIONARY_FULL_DAY — default / `stationaryCountsTowardMinDays` | 0 / 1.0 | stationary |
| STATIONARY_HALF_DAY / STANDBY_WAITING | 0 | stationary / standby |
| FREE_DAY_NO_VEHICLE | 0 | free |

### Retention — adjacency alone is NEVER proof (locked correction)
A `POINT_TO_POINT` day counts as retained only via (precedence):
1. `retained === true` → `explicit-retained`
2. `retained === false` / `vehicleReleased === true` → `released` (weight 0)
3. `inRetainedBlock === true` → `retained-block`
4. same supplier+vehicle on an adjacent day **AND** `vehicleReleased === false` → `continuous-same-vehicle`
5. same supplier+vehicle adjacency with **no** release/block info → **candidate only**,
   `not-retained-default` + `retentionCandidate = true`, `billedAs = manual-required`, weight 0
6. lone day, no signal → `not-retained-default`, weight 0

## Shadow classification examples (real output)
**A — 3-day retained block (explicit) → counts 3.0**
`P2P(retained) · TOURING · P2P(retained)` → weights `1 · 1 · 1`, all `full-day`,
`countedFullPackageDays = 3`.

**B — transfers only (airport + released P2P) → counts 0**
`AIRPORT_TRANSFER` → 0 `separate-transfer`; `P2P(vehicleReleased)` → 0 `separate-transfer`,
reason `released`. `countedFullPackageDays = 0`.

**C — adjacency candidate (same supplier+vehicle, no signal) → counts 0, flagged**
Both days → weight 0, `billedAs = manual-required`, `retentionCandidate = true`,
reason `not-retained-default`. `countedFullPackageDays = 0` (needs manual confirmation).

**D — mixed under a permissive contract → counts 1.5**
`STATIONARY_FULL_DAY` (`stationaryCountsTowardMinDays`) → 1.0 `stationary`;
`FREE_DAY_NO_VEHICLE` → 0 `free`; `HALF_DAY_SERVICE` (`halfDayCountsTowardMin`) → 0.5
`half-day`. `countedFullPackageDays = 1.5`.

## Tests
`apps/api/src/common/transport-day-classification.test.ts` — **18 tests, all passing**
(`node --test --require ts-node/register`). Covers: direct airport transfer, airport
included, released P2P, retained P2P, touring day, half-day default 0, half-day 0.5 when
allowed, half-day charged-as-full, stationary full day, free day, airport+sightseeing
reclassified, 3-day retained block, lone released drop-off, adjacency-candidate
(manual-required), continuous-same-vehicle retained, explicit override, retained-block,
lone-default.

## Confirmation — no behavior changed
- **No pricing/quote output changed** — the module is imported by nothing in the pricing
  or quote path (verified by grep); quote totals, selected supplier, and pricing method
  are unaffected.
- No schema change, no migration, no DB write, no quote-builder UI change.
- No `DAILY_PACKAGE` activation, no `PACKAGE_MIN_FULL_DAY` contracts, no minimum-day
  enforcement, no overnight charging — all deferred to PR 4.

## Not in scope
PR 4 (minimum-day enforcement / package eligibility) wiring this classifier into pricing.
The deeper `touring_route_days` schema drift remains a separate follow-up.
