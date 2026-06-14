# PR 11B-2 — Vehicle-aware allowlist for package live apply (PLAN ONLY)

**Date:** 2026-06-14
**Status:** PLAN ONLY — no code/schema/migration/DB/flag/quote/contract changes.
**Builds on:** PR 11A (live apply pinned to pilot `66f5de06-…`, flag default OFF) + PR 11B-1 audit.
**Recommended:** ship **11B-2A (shadow diagnostics only) first** — live apply behavior unchanged.

## 0. Audit (read-only, 2026-06-14) — Large Bus vehicles
| vehicle | id | kind | USD rates | quote-items using | DAILY_FULL_DAY USD |
|---|---|---|---|---|---|
| **Large 49** | `6d575442-05fd-4cf6-bd22-5e8a0ee12303` | **standard** | 62 | **10** (the 2 test quotes) | **656** |
| Large VIP 31‑33 | `49c5fd5d-6abe-4633-a859-53cb35a04a07` | VIP | 62 | 0 | **930** |
| Mercedes Grand Star 31 | `33906a47-223f-4beb-972b-9b9188576373` | Grand Star | 0 | 0 | — |
| Mercedes Grand Star 49 | `94c1a79b-7039-41d2-8ce9-d8248b5ce880` | Grand Star | 0 | 0 | — |
| Large Coach 49 | `ca498a75-6052-417f-bbc2-6d1a7ad4e2c0` | (no supplier) | 0 | 0 | — |

Pilot contract `fullDayRate = 656 = Large 49 DAILY_FULL_DAY`. **VIP is 930** → a class-level apply
would under-price VIP by ~274/day. **Allowlist for the pilot contract = exactly `{Large 49 6d575442}`.**

## 1. Vehicle-aware allowlist model
- **Key = contract ID → allowed vehicle ID(s).** Apply may proceed only when the saved package
  contract is allow-listed **and** the quote's resolved primary transport vehicleId is in that
  contract's allowed set. Supplier+class remains a necessary gate, never sufficient.
- **Prevents VIP/VVIP/Grand Star mis-pricing:** those vehicleIds are simply not in the pilot
  contract's allowed set → blocked, even though they share `vehicleClass = Large Bus`.
- **Where to store it — options:** (a) **in-code constant** map; (b) env/config; (c) DB table;
  (d) `TransportContract` metadata / allowed-vehicle relation (schema).
  **Recommendation for PR 11B-2: (a) in-code constant** — small, closed, reviewed-in-PR set; no
  schema; trivially auditable. Initial value = `{ '66f5de06-…': ['6d575442-… (Large 49)'] }`.
  (env can't cleanly express per-contract vehicle lists; DB table / contract metadata are deferred
  to a later PR if the allowlist grows or needs non-deploy edits — Option B/d.)

## 2. Shadow-first behavior (11B-2A)
- **No broadening of live apply.** `computeQuotePackageLiveApply` stays **byte-for-byte PR 11A**
  (still pinned to the single pilot id) in 11B-2A. The allowlist is computed **read-only** and
  surfaced in the pricing-shadow diagnostic only.
- The pricing-shadow GET response gains an additive `allowlist` block (pass/fail + reason +
  resolved vehicle), gated by the existing read flag `transport.packagePricingShadowCompare`.
- **Live apply remains behavior-equivalent to PR 11A** until 11B-2B is separately approved.
- **Production flag stays OFF.**

## 3. Matching logic — identifying the actual vehicle used
From each active itinerary day's transport line(s) (`quoteItineraryDay → dayItems → quoteService`):
- **vehicleId source (authoritative):** `appliedVehicleRate.vehicle.id` (the vehicle of the rate
  actually priced); fallback to `quoteService.vehicleId` scalar; for touring lines,
  `touringRoutePricing.vehicle.id`.
- **vehicleClass / supplier:** as today via `mapShadowDays.primary` (first transport day).
- **contractId:** the quote's `selectedTransportContractId`.
- **currency:** `quote.quoteCurrency` vs contract currency (USD gate).
- **Counted vs all:** evaluate the vehicleId set over the **counted** package days (weight > 0) —
  those are what the package replaces. (Excluded airport/transfer days may legitimately use the
  same or different vehicle; they are not repriced, so they don't gate the vehicle gate, but a
  divergent supplier on them is still caught by the mixed-supplier check.)
- **Single vehicle:** the one distinct counted vehicleId → check against the contract's allowed set.
- **Mixed vehicles:** >1 distinct counted vehicleId → block `mixed-vehicles`.
- **Missing vehicleId:** any counted transport line with no resolvable vehicleId → block
  `missing-vehicle-id` (ambiguous; never guess).
- **Multiple vehicles in one quote (across days):** handled by the mixed-vehicles rule on counted
  days; excluded days don't relax it.

> Note: PR11A/diagnostic already resolves `primary` supplier+class. 11B-2A adds capturing the
> counted-day **vehicle id(s)** (extend the day query select with `appliedVehicleRate.vehicle.id` /
> `touringRoutePricing.vehicle.id`).

## 4. Block rules (reported in 11B-2A; enforced in 11B-2B)
Package apply is blocked if ANY of:
- selected contract **not allow-listed** → `not-allowlisted-contract`
- resolved counted vehicleId **not in the contract's allowed set** → `vehicle-not-allowlisted`
  (covers VIP 31‑33 / VVIP / Grand Star unless explicitly added)
- **mixed vehicles** across counted days → `mixed-vehicles`
- **mixed suppliers** → `mixed-supplier` (multiple supplierIds across transport lines)
- **mixed currency** / non-USD → `cross-currency`
- **missing/ambiguous vehicleId** → `missing-vehicle-id`
- plus all PR 11A blocks (carried): stale selection, manual-required days, stationary/standby,
  overnight/ADD_ON, `excursionPackageRate` overlap, slab mode, ineligible/below-minimum,
  no-primary-transport, contract inactive/wrong-regime/not-USD.

## 5. Data audit results (see §0)
- All Alpha Large Bus vehicles: Large 49, Large VIP 31‑33, Mercedes Grand Star 31, Mercedes Grand
  Star 49 (+ Large Coach 49, no supplier).
- **Standard Large 49:** `6d575442-…` (62 USD rates, used in 10 quote-items — the two test quotes).
- **VIP/VVIP/Grand Star:** `49c5fd5d-…` (VIP, 62 rates, DAILY_FULL_DAY 930), `33906a47-…` /
  `94c1a79b-…` (Grand Star, 0 rates), `ca498a75-…` (Coach, non-Alpha, 0 rates).
- **Have rates:** Large 49 + Large VIP 31‑33 (62 USD each); Grand Star / Coach have none.
- **Used in quotes:** only Large 49 (10 items, the test quotes); others 0.
- **Allowlist for the pilot contract:** **`6d575442-05fd-4cf6-bd22-5e8a0ee12303` (Large 49) only.**

## 6. Tests (for the implementation when approved)
11B-2A (diagnostics; live apply unchanged):
- pilot contract + Large 49 → allowlist decision **pass**.
- pilot contract + VIP 31‑33 → **blocked** `vehicle-not-allowlisted`.
- pilot contract + Grand Star → **blocked** `vehicle-not-allowlisted`.
- non-allowlisted contract id → **blocked** `not-allowlisted-contract`.
- missing vehicleId on a counted line → **blocked** `missing-vehicle-id`.
- mixed vehicles (two distinct counted vehicleIds) → **blocked** `mixed-vehicles`.
- mixed suppliers → **blocked** `mixed-supplier`.
- mixed/non-USD currency → **blocked** `cross-currency`.
- shadow response exposes the allowlist decision + reason + resolved vehicleId.
- **live behavior unchanged:** `computeQuotePackageLiveApply` still applies for the Large 49 pilot
  quote and still blocks everything PR 11A blocked (regression assertions over the 11A test set).
11B-2B (enforcement, separate): the same block reasons now returned by `computeQuotePackageLiveApply`;
QuoteItems not mutated; flag-OFF rollback; no automatic cheapest selection.

## 7. Recommended PR split (matches your preference)
- **PR 11B-2A — read-only vehicle-aware allowlist DIAGNOSTICS only** (recommended first). Shadow
  surfaces the allowlist decision; live apply untouched; flag OFF. ← do this first.
- **PR 11B-2B — enforce the allowlist in `computeQuotePackageLiveApply`** for the pilot (adds the
  vehicle gate so even the pilot path requires Large 49). Separate approval; still flag-gated.
- **PR 11B-3 — one new supplier/class package contract** after commercial sign-off, allow-listed and
  validated via the PR 11A playbook.
- (PR 12 overnight/stationary; PR 13 retire `excursionPackageRate` — unchanged, later.)

## 8. File list (if/when implemented)
**11B-2A:**
- `apps/api/src/transport-pricing/package-eligibility-shadow.service.ts` — add an in-code
  `PACKAGE_VEHICLE_ALLOWLIST` constant + `computePackageAllowlistDecision(...)` helper; extend the
  pricing-shadow day query to capture counted-day vehicle id(s); add an additive `allowlist` block
  to `evaluateQuotePackagePricingShadow`'s return (read-only). **No change to
  `computeQuotePackageLiveApply`.**
- `apps/api/src/transport-pricing/package-eligibility-shadow.service.test.ts` — §6 (11B-2A) tests.
- `docs/transport-pr11b2a-verification-*.md` — verification.
**11B-2B (later):** same service — call the allowlist decision inside `computeQuotePackageLiveApply`
as an additional gate; tests; verification doc.
**No schema/migration** (Option A in-code allowlist). `quotes.service.ts` untouched (reuses the
PR 11A recompute hook). No `proposal-v3-pdf-export.test.ts`, no stash, no dana.

## 9. Acceptance criteria (11B-2A)
- **No live behavior change** — `computeQuotePackageLiveApply` identical to PR 11A; the 11A test set
  still passes unchanged.
- **No quote total changes, no DB writes, no production flag change.**
- Shadow endpoint clearly reports allowlist **pass/fail + reason + resolved vehicleId** (gated by the
  existing read flag).
- **VIP/standard conflation is surfaced clearly** (VIP/Grand Star → explicit `vehicle-not-allowlisted`
  in the diagnostic), proving the guard 11B-2B will enforce.
- All existing + new tests green; build green.

## Risks
- Vehicle-id resolution gaps (touring vs vehicle-rate lines) — mitigated by checking
  appliedVehicleRate/touringRoutePricing vehicle + scalar, and **blocking on missing/ambiguous**.
- Allowlist drift — keep it a small reviewed constant; log enabled entries; revisit Option B/d if it
  grows.
- 11B-2A must not accidentally change live apply — enforced by leaving `computeQuotePackageLiveApply`
  untouched + a regression test asserting parity with PR 11A.

## Strictly not in this step
No code/schema/migration/DB/flag/quote/contract changes; no allowlist implementation; no new PACKAGE
contracts; no live activation; no PR 12/13; no quote-WIP stash; no dana; `proposal-v3-pdf-export.test.ts`
excluded.
