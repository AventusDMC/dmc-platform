# PR 11A — Pilot validation plan (Alpha Large Bus USD), live-apply flag OFF

**Date:** 2026-06-14
**Status:** PLAN ONLY. No implementation, no flag changes, no data mutation — except (after your
approval) optional safe **day-metadata** and a **package selection** on one chosen test quote.

**Goal:** validate the pilot package contract end-to-end **without enabling live apply**. Because
`computeQuotePackageLiveApply` reuses the exact PR9 shadow math, **the shadow numbers ARE the
apply numbers** (`shadow.difference === live costDelta`). So we can prove the applied total by
arithmetic from read-only shadow output — no need to turn the live flag on.

## Pilot facts (pinned)
- Contract id **`66f5de06-28df-426c-90b8-ffaa01ed5c5f`** · supplier **Alpha** `3f63311b-021f-432a-8ff8-fc5d5f407ad0` · vehicleClass **Large Bus** · currency **USD**.
- `regime PACKAGE_MIN_FULL_DAY`, `minimumFullDays 3`, `INELIGIBLE_UNDER_MIN`, `fullDayRate 656`, `halfDayRate 370`, validity 2026-04-01..12-31, active.
- Alpha `transportDiscountPercent = 25`. **Standard Large Bus 49 rate only — NOT VIP 31–33.**

## Environment & flags (validation runs in a NON-prod / local API; prod flags stay OFF)
| Flag (env) | State for validation | Why |
|---|---|---|
| `transport.packageEligibilityShadow` (`TRANSPORT_PACKAGE_ELIGIBILITY_SHADOW`) | ON (local) | eligibility diagnostic |
| `transport.packagePricingShadowCompare` (`TRANSPORT_PACKAGE_PRICING_SHADOW_COMPARE`) | ON (local) | the pricing numbers + savedSelection/selectionStale |
| `transport.packageOptionSelection` (`TRANSPORT_PACKAGE_OPTION_SELECTION`) | ON (local) | save/read selection |
| `NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTIONS_PREVIEW` / `…OPTION_SELECTION` | ON (local admin-web) | optional UI path |
| **`transport.packagePricingLiveApply` (`TRANSPORT_PACKAGE_PRICING_LIVE_APPLY`)** | **OFF everywhere** | live apply must NOT run during validation |

> Run a **local** API/admin-web with the three shadow/selection flags ON and live-apply OFF,
> pointed at the shared Railway DB (read for shadow; the only write is the optional metadata/
> selection you approve). **Do not enable any production flag.**

---

## 1. Test-quote selection (how to pick a safe Alpha Large Bus USD quote)
Pick a candidate USD quote, then **let the shadow confirm safety** (no DB spelunking required):
1. Candidate must have `quoteCurrency = USD` and ≥3 transport days on the standard Large Bus.
2. Call the **pricing-shadow** (step 3 below) and confirm ALL of:
   - `packageContractId === '66f5de06-28df-426c-90b8-ffaa01ed5c5f'` → the quote's resolved primary
     supplier+class **is** Alpha Large Bus (this is the safety gate — if it's any other contract or
     `null`, the quote is NOT the pilot; reject it).
   - `supplierDiscountPercent === 25` (Alpha).
   - `packageEligible === true`, `manualRequiredDays === 0`.
   - `warnings` does NOT include `stationary-not-priced-in-pr9` (no stationary day).
3. **Avoid Alpha VIP 31–33:** inspect the quote's transport line vehicle (quote detail / item card)
   and confirm it is the **standard Large Bus**, not a VIP 31/33 variant. If VIP, the primary class
   won't match the pilot and `packageContractId` won't be the pilot id → reject. (Pilot is pinned by
   contract id, so VIP can never borrow the Large Bus 49 rate — but pick a clean standard-bus quote
   for a clean validation.)
4. **Avoid non-pilot suppliers/classes:** any quote whose `packageContractId` ≠ the pilot id (e.g.
   Almushtari/JOD small vehicles) is out of scope — reject.
5. Prefer a **non-production / sandbox or clearly-test** quote so the optional selection write is
   harmless. Record the chosen `quoteId`.

## 2. Itinerary-day metadata to set (only if needed to make the quote a clean pilot case)
Set via the planner "Transport day (advanced)" UI (PR7) or leave NULL to use conservative
inference. Aim for **3 counted full days + clean excluded days**:
- **3 touring/full-day Large Bus days** → `transportDayType = TOURING_ROUTE` (or `FULL_DAY_SERVICE`),
  leave retention Auto, OR set `vehicleRetained = true` / `inRetainedBlock = true` on retained P2P
  days you want counted.
- **Airport transfer day(s):** `transportDayType = AIRPORT_TRANSFER` → excluded by default (cost
  retained).
- **Released transfer day:** `vehicleReleased = true` → weight 0 (excluded). Do NOT also set
  retained (contradiction → manual-required/invalid, blocks apply — that's by design).
- **Stationary / standby days:** for the *positive* pilot case, **avoid** them (they block apply in
  11A). To validate the block path, set `transportDayType = STATIONARY_FULL_DAY` (or `STANDBY_WAITING`)
  on one day and confirm the live decision blocks (step 5 negative cases).
- Never set `vehicleRetained=true` AND `vehicleReleased=true` on the same day unless deliberately
  testing the contradiction→manual-required path.

> Metadata is additive/metadata-only (PR6) — it never changes live pricing on its own.

## 3. Selection workflow (preview → save → confirm not-stale → confirm notApplied)
1. **Preview (read-only):**
   `GET /api/transport-pricing/quotes/{quoteId}/package-pricing-shadow` (admin-web proxy adds actor
   headers; or call the API directly with an admin/finance session token). Confirm the safety fields
   in §1.
2. **Save the package selection** (the only approved write):
   `PATCH /api/transport-pricing/quotes/{quoteId}/package-selection` body `{"option":"PACKAGE_MIN_FULL_DAY"}`.
   Expect echo `{ selectedTransportPricingOption: "PACKAGE_MIN_FULL_DAY", selectedTransportContractId:
   "66f5de06-…", transportSelectionAt: <ts>, transportSelectionByUserId: <actor|null>, notApplied: true }`.
   (Ineligible would 400 — for the positive case it must succeed.)
3. **Confirm not stale:** re-`GET …/package-pricing-shadow` and confirm
   `savedSelection.option === "PACKAGE_MIN_FULL_DAY"`, `savedSelection.contractId === "66f5de06-…"`,
   **`selectionStale === false`**.
4. **Confirm notApplied while live flag OFF:** the response carries `notApplied: true`, and the
   quote's persisted `totalCost`/`totalSell` (quote detail) are **unchanged** vs before the save —
   because `TRANSPORT_PACKAGE_PRICING_LIVE_APPLY` is OFF, `recalculateQuoteTotals` adds no delta.
5. **Optional clear (cleanup):** `PATCH …/package-selection` body `{"option":null}` → all selection
   fields null.

## 4. Shadow comparison — record every number
From `GET …/package-pricing-shadow`, capture and record:
| Field | Meaning |
|---|---|
| `currentTransportTotal` | full persisted transport baseline (counted + excluded) |
| `excludedDays[]` + their `routeCost` | excluded retained transfer/airport costs |
| (counted base) = `currentTransportTotal − Σ excludedDays.routeCost` | counted/replaced transport baseline |
| `packageGrossTotal` | package gross **incl.** retained excluded cost |
| `supplierDiscountPercent` / `supplierDiscountAmount` | 25% / discount amount |
| `packageNetTotal` (= `packageCandidateTotal`) | package net **incl.** retained excluded cost |
| `difference` | = `packageNetTotal − currentTransportTotal` = **live costDelta** |
| `packageEligible`, `countedFullPackageDays`, `manualRequiredDays`, `warnings` | eligibility context |

**Cost-side expected final total if flag ON** = `quote.totalCost (now) + difference`.
(`difference` is exactly the delta `recalculateQuoteTotals` would add.)

**Sell-side** (shadow does not compute sell — derive it):
- From quote detail, sum the **counted** transport lines' persisted `totalSell` = `countedSell`, and
  their cost = `countedCost` (counted = the weight>0 days; equals `currentTransportTotal − excluded`).
- `m = countedSell / countedCost` (weighted-avg markup).
- `packageDaysNet = packageNetTotal − Σ excludedDays.routeCost` (strip retained cost).
- `sellDelta = packageDaysNet × m − countedSell`.
- **Sell-side expected final total if flag ON** = `quote.totalSell (now) + sellDelta`.

## 5. Manual cross-check vs the Alpha contract (checklist)
For the chosen quote, confirm by hand:
- [ ] **Min 3 full days:** `countedFullPackageDays ≥ 3`; if it were 2, `packageEligible=false`, `reason=below-minimum`.
- [ ] **Full-day rate 656:** `packageDaysGross = fullDayCount × 656 (+ halfDayCount × 370)` matches `packageGrossTotal − Σ excludedDays.routeCost`.
- [ ] **Half-day rate 370:** if any counted half day, it contributes 370 (else n/a).
- [ ] **Discount 25%:** `packageDaysNet = packageDaysGross × 0.75`; `supplierDiscountPercent = 25`. Applied **once**.
- [ ] **Airport transfer separate:** airport day appears in `excludedDays` (reason `airport`); its cost is in both totals (retained, not replaced).
- [ ] **No driver overnight in pilot:** `warnings` includes `excludes-driver-overnight`; no ADD_ON overnight line on counted days (would block live apply).
- [ ] **No stationary pricing in pilot:** no `stationary-not-priced-in-pr9` warning for the positive case; a stationary day would block live apply (`stationary-standby-present`).
- [ ] **Standard Large Bus 49 only, not VIP 31–33:** `warnings` includes `standard-large-bus-49-rate-only-not-vip-31-33`; quote's vehicle is the standard Large Bus; `packageContractId` = pilot id.
- [ ] **Eligibility-shadow agreement:** `GET …/package-eligibility-shadow` returns `contract.found=true`, `eligibility.eligible=true`, same `countedFullPackageDays`/`manualRequiredDays`.

**Negative cases to spot-check (block → fallback, no apply even with live flag ON):**
- [ ] 2-day quote → below-minimum.
- [ ] day with `vehicleReleased=true` across all 3 → ineligible/0 counted.
- [ ] day with `transportDayType=STATIONARY_FULL_DAY` → would block (`stationary-standby-present`).
- [ ] non-pilot contract id stored (e.g. cleared then a different value) / VIP / non-USD → not pilot → fallback.

## 6. Safety constraints (enforced throughout)
- `TRANSPORT_PACKAGE_PRICING_LIVE_APPLY` stays **OFF** (no apply runs).
- Do **not** enable any production flag (validation flags are local/non-prod only).
- Do **not** create new contracts; do **not** edit pricing logic; do **not** run migrations.
- Do **not** change quote totals (the selection save is metadata-only; totals stay put with live OFF).
- Do **not** touch unrelated files; `proposal-v3-pdf-export.test.ts` stays excluded.
- Only mutations (after your approval): optional day metadata via the planner + one package
  selection via the PATCH endpoint, on the single chosen test quote.

## 7. Output of validation (what to produce when run)
- **Validation steps:** §1 pick → §2 metadata → §3 preview/save/confirm → §4 record numbers → §5 cross-check.
- **Exact endpoints:**
  - `GET /api/transport-pricing/quotes/{id}/package-pricing-shadow` (proxy) or
    `GET /transport-pricing/quotes/{id}/package-pricing-shadow` (API, `@Roles admin,finance`).
  - `GET /transport-pricing/quotes/{id}/package-eligibility-shadow`.
  - `PATCH /api/transport-pricing/quotes/{id}/package-selection` body `{option}` (proxy, PATCH-only).
  - Quote detail (existing) to read persisted `totalCost`/`totalSell` and transport line `totalSell`.
- **Expected outputs:** `packageContractId` = pilot id; `packageEligible=true`; `difference` =
  cost delta; `selectionStale=false` after save; `notApplied=true`; persisted totals unchanged.
- **Pass criteria:** all §5 checks tick; `difference` and the hand-computed cost/sell deltas agree
  with the Alpha contract math (656/370/25%); positive case saves without 400; negative cases block;
  persisted quote totals never change while live flag OFF.
- **Fail criteria:** any mismatch between ERP shadow numbers and the manual Alpha math; a stale or
  wrong `packageContractId`; a 400 on a should-be-eligible quote; any change to persisted totals
  with the live flag OFF; the pilot rate applied to a VIP/other-class/non-USD quote.
- **Rollback / cleanup:** `PATCH …/package-selection {"option":null}` to clear the test selection;
  revert any test day metadata (set retention back to Auto / clear transportDayType); turn the local
  validation flags OFF. No DB rollback needed (no schema, no totals change, metadata is nullable).

## 8. Note on validating the *applied* number without enabling live apply
We do **not** need to enable `transport.packagePricingLiveApply` to trust the apply result: the
live path computes `costDelta = packageNet − countedCost`, which equals the shadow's `difference`
(both add `excludedRouteCost` identically and cancel it). So the applied cost total = current
`totalCost + difference`, verifiable by arithmetic. If you later want a live observation, that
should be a **separate, explicitly-approved** local-only dry run (flag ON in local against a
throwaway/test quote) — out of scope for this validation, which keeps the flag OFF.
