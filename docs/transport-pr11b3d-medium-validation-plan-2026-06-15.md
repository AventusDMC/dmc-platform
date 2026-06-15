# PR 11B-3D — Alpha Medium Bus / Medium 30 validation plan (PLAN ONLY)

**Date:** 2026-06-15
**Status:** PLAN ONLY — no create/mutate. Same safe process as the Large 49 pilot:
shadow-first (flag OFF) → controlled flag-ON on throwaway test quotes only → restore → no prod.
Contract `eabd43a0-2374-49d7-aaba-959df4d7c8bd`; allowed vehicle Medium 30
`da68f987-ce15-469a-8a65-50c2ee2bbca3`. Flag stays OFF.

## 1. Read-only candidate discovery (done)
3 quotes use Medium 30 (USD; none use Large VVIP 29):
| quoteId | title | currency | status | Medium 30 items | VVIP items |
|---|---|---|---|---|---|
| `43232651-a895-4e83-8843-93945f6ceb27` | Amman + Petra + Wadi Rum + Dead Sea (7 nights) | USD | DRAFT | 7 | 0 |
| `b1faddbc-fbaa-4c14-928e-7c84769ccd3a` | sample 2 | USD | DRAFT | 7 | 0 |
| `74ee023b-bfcc-44e7-b995-363a64b8b0d6` | Exodus & Holy Land Biblical Journey | USD | **CONFIRMED** | 3 | 0 |
**Assessment:** these are real multi-day itineraries, not clean 3-full-day package fixtures (P2P days
without explicit retention would classify manual-required → not a clean eligible case). The
**CONFIRMED "Exodus" quote is off-limits** (never touch). They may serve at most an incidental
**read-only shadow sanity check**; they are **not** flag-ON validation vehicles. → Use throwaway test
quotes (same as Large 49).

## 2. Throwaway test quotes (recommended)
Two, clearly titled (DRAFT, USD, Alpha, Medium 30, 0% markup):
- `TEST — Alpha Medium Bus Package Pilot — DO NOT USE` (Scenario A, deterministic).
- `TEST — Alpha Medium Bus Package Pilot P2P — DO NOT USE` (Scenario B, visible saving).
Built via the proven engine-driven NestApplicationContext script (createDay + createItem +
createDayItem + updateDay), serviceId = Alpha transport SupplierService, vehicleRateId pins the rate,
abort-on-anomaly if any item resolves to a non-Medium-30 vehicle.

## 3. Scenario A — deterministic (Medium 30)
Days: D1 QAIA→Amman AIRPORT_TRANSFER (307) · D2–4 DAILY_FULL_DAY Medium 30 (525) · D5 Amman→QAIA
AIRPORT_TRANSFER (307). Metadata: D1/D5 `AIRPORT_TRANSFER`; D2–4 `FULL_DAY_SERVICE` (auto-counts).
Persisted net = gross×0.75.
- counted (3 full) = 3×393.75 = **1181.25**; package net days = 3×525×0.75 = **1181.25** → **delta 0**.
- excluded airport = 2×230.25 = 460.5; baseline = 1641.75.
- **Expected checks (flag OFF shadow):** `packageContractId = eabd43a0-…`; counted-day vehicle =
  `da68f987-…`; `packageEligible = true`; `countedFullPackageDays = 3`; `manualRequiredDays = 0`;
  `allowlist.allowed = true` (Medium 30); after save `selectionStale = false`; `notApplied = true`;
  persisted totals unchanged (1641.75) with flag OFF.
- delta 0 (package == discounted daily card) — deterministic correctness, not a saving.
- DAILY_FULL_DAY needs a real routeId to pass the createItem guard (vehicleRateId pins 525) — same
  gotcha as Large 49 Scenario A.

## 4. Scenario B — retained P2P, Aqaba fixed-base (visible saving)
The Medium 30 P2P network is the same Aqaba-star as Large Bus (no chained interior legs) → use the
approved Aqaba fixed-base synthetic structure (sleep Aqaba, retained excursions, fly AQJ).
| Day | Leg | rate (gross/net) | vehicleRateId | role |
|---|---|---|---|---|
| 1 | AQJ → Aqaba | 210 / 157.5 | `6d1a6f71-86a1-4c80-808b-d1cd22a36e6d` | excluded (airport meta) |
| 2 | Aqaba → Petra (retained) | 1134 / 850.5 | `fdb15184-462a-499c-bbde-09f1068c1294` | counted |
| 3 | Aqaba → Wadi Rum (retained) | 1015 / 761.25 | `abd4ec53-b7a6-4c57-83e2-ba3986eaaf15` | counted |
| 4 | Aqaba → Dead Sea (retained) | 1568 / 1176 | `7bf3a103-7b83-4cad-9b2d-2b6eca22a01a` | counted |
| 5 | Aqaba → AQJ | 210 / 157.5 | `ad037595-c561-4661-8db7-aff575201784` | excluded (airport meta) |

Predicted math (0% markup → sell = cost):
- **counted/replaced baseline** = 850.5 + 761.25 + 1176 = **2787.75**
- **excluded airport** = 157.5 + 157.5 = **315.00**
- **persisted baseline total** = 3102.75 (cost = sell)
- **package gross (days)** = 3 × 525 = **1575**
- **supplier discount 25%** → **package net (days)** = **1181.25**
- **cost delta** = 1181.25 − 2787.75 = **−1606.50**  (= shadow `difference` = 1496.25 − 3102.75)
- **sell delta** (0% markup) = **−1606.50**
- **expected final if flag ON** = 3102.75 − 1606.5 = **1496.25 / 1496.25**
- **required day metadata:** D1/D5 `transportDayType = AIRPORT_TRANSFER`; D2–4
  `transportDayType = POINT_TO_POINT`, `vehicleRetained = true`, `inRetainedBlock = true`,
  `vehicleReleased = null`.

## 5. Controlled flag-ON validation (after shadow passes + explicit approval)
The proven 2-phase throwaway script, on the two Medium test quotes ONLY:
- Preflight (read-only, assert per quote): DRAFT, title prefix `TEST — Alpha Medium Bus Package
  Pilot`, USD, `selectedTransportPricingOption = PACKAGE_MIN_FULL_DAY`,
  `selectedTransportContractId = eabd43a0-…`, `selectionStale = false`. Abort on mismatch.
- Phase 1 (flag ON in-process only): recompute → expect A unchanged (delta 0), B
  3102.75 → 1496.25.
- Phase 2 (flag OFF, `finally`): recompute → restore (A unchanged, B back to 3102.75).
- Assert QuoteItem count + Σcost + Σsell identical before/after (no item mutation); only quote-level
  totals changed temporarily; final = baseline. Never change production env.

## 6. Negative validation (mostly already covered by PR 11B-3C unit tests; re-affirm)
- **Large VVIP 29 + Medium contract → blocked** `vehicle-not-allowlisted` (unit test exists; optional
  throwaway VVIP quote → shadow `allowlist.allowed = false`).
- Medium 30 + wrong contract (Large) → `supplier-class-mismatch`; Large 49 + Medium contract →
  `supplier-class-mismatch` (unit tests).
- missing vehicle id / mixed vehicles / mixed suppliers / cross-currency / stationary-standby /
  overnight-ADD_ON / excursionPackageRate overlap → all blocked (existing PR 11A/11B-2B/3C tests).

## 7. Safety and rollback
- Production live-apply flag remains **OFF** throughout; no production env change.
- No real quotes touched for flag-ON (throwaway only); the CONFIRMED Exodus quote is never touched.
- Test quotes stay DRAFT/TEST; saved selections are metadata-only while the flag is OFF.
- Cleanup: clear selection (`{option:null}`), reset day metadata to Auto, keep or archive/delete the
  test quotes per instruction. No DB rollback (no schema; contract already exists).

## Risks
- DAILY_FULL_DAY == fullDayRate → Scenario A delta 0 (expected; the B test shows the saving).
- Spoke-rate-as-excursion-proxy caveat (Aqaba fixed-base) — accepted as synthetic engine-validation,
  same as Large 49 Scenario B; base city constant so no repositioning gap.
- Real Medium 30 quotes are not clean fixtures → use throwaway; never touch the CONFIRMED quote.
- Engine-create gotchas (serviceId required; routeId/normalizedKey guard; actor companyId) — known
  from the Large 49 build; the script asserts vehicle = Medium 30 and aborts otherwise.

## Acceptance criteria
- Shadow (flag OFF): Medium test quotes resolve contract `eabd43a0-…`, vehicle `da68f987-…`,
  eligible, counted 3, manualReq 0, `allowlist.allowed = true`, `notApplied = true`, selection not
  stale; totals unchanged.
- Controlled flag-ON (test quotes only): A delta 0 (1641.75 → 1641.75), B delta −1606.5
  (3102.75 → 1496.25); both restored to baseline after flag OFF; no QuoteItem mutation.
- VVIP / wrong-contract / wrong-vehicle / mixed / missing / cross-currency / stationary / overnight /
  overlap all blocked.
- Production flag stays OFF; no schema/DB-write beyond the approved test-quote create + selection +
  the temporary-then-restored totals; `quotes.service.ts` untouched; `proposal-v3` excluded.

## Recommended next steps
- **PR 11B-3D-i:** read-only candidate discovery (this) → build the two throwaway Medium test quotes
  + shadow validation (flag OFF). 
- **PR 11B-3D-ii:** controlled flag-ON validation on those test quotes (separate approval), reversed
  in-run. Then PR 12 (overnight/stationary), PR 13 (retire excursionPackageRate).

## Strictly not in this step
No create/mutate; no code/schema/migration/DB/flag/contract change; no production activation; no PR
12/13; no quote-WIP stash; no dana; `proposal-v3-pdf-export.test.ts` excluded.
