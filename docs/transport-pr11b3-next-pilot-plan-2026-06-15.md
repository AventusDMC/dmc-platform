# PR 11B-3 — Next package-contract pilot: audit + plan (PLAN ONLY)

**Date:** 2026-06-15
**Status:** PLAN ONLY — no code/schema/migration/DB/flag/quote/contract changes.
**Process (unchanged):** audit → choose candidate → create ONE pilot contract → shadow validate →
controlled validation (throwaway quote) → only later consider real live apply. Flag stays OFF.

## Checkpoint record (PR 11B-3A, 2026-06-15)
1. **Only ONE `PACKAGE_MIN_FULL_DAY` contract exists today** (the Alpha Large Bus USD pilot `66f5de06-…`).
2. **Recommended next pilot = Alpha Medium Bus, USD.**
3. **Intended allowed vehicle = "Medium 30" `da68f987-ce15-469a-8a65-50c2ee2bbca3`** (full-day 525 / half 307).
4. **Large VVIP 29 `ac827384-…` (1069/674) MUST be blocked** (shares `Medium Bus` class → isolate via allowlist).
5. **JOD suppliers/classes remain deferred** until an explicit FX policy exists (USD-only for now).
6. **No new PACKAGE contract is created in PR 11B-3A** — this is documentation only.
7. **PR 11B-3B** creates the Medium Bus package contract.
8. **PR 11B-3C** generalizes the live-apply pin from a single hard-coded id to a **closed contract
   allowlist** (Large 49 pilot → Large 49 vehicle; Medium contract → Medium 30 vehicle) + vehicle allowlist.
9. **PR 11B-3D** runs shadow + controlled validation (throwaway test quote; flag-ON reversed in-run).
10. **PR 12** remains driver overnight + stationary.
11. **PR 13** remains retiring the legacy `excursionPackageRate` overlap.

This PR (11B-3A) is **documentation only** — no code, schema, migration, DB write, flag change, quote
mutation, or contract creation. Production live-apply flag stays OFF; live apply still pinned to the
single Large 49 pilot.

## 0. Read-only audit (2026-06-15) — Alpha USD candidate classes (25% discount)
All Alpha USD vehicles have DAILY_FULL_DAY + HALF_DAY + 22 P2P + 4 AIRPORT + 1 STATIONARY_WAITING
(ADD_ON) + 1 EXTRA_KM (ADD_ON) rate rows.

| Class | Vehicle | id | daily/half USD | quote usage | VIP? |
|---|---|---|---|---|---|
| Large Bus | Large 49 (PILOT) | `6d575442-…` | 656 / 370 | 10 | — |
| Large Bus | Large VIP 31‑33 | `49c5fd5d-…` | 930 / 585 | 0 | VIP (blocked) |
| **Medium Bus** | **Medium 30** | `da68f987-ce15-469a-8a65-50c2ee2bbca3` | **525 / 307** | **17** | — |
| Medium Bus | Large VVIP 29 | `ac827384-7e66-4ca6-9907-0098ccf60de7` | 1069 / 674 | 0 | VIP |
| Mini Van | Mini Van 5 | `fa746674-…` | 153 / 92 | 22 | — |
| Small Mini Bus | Van 12 | `722f8511-…` | 302 / 226 | 4 | — |
| Small Mini Bus | Small 17 | `401f5cd7-…` | 334 / 253 | 0 | — |
| Van | Van VIP 9 | `013b9afe-…` | 656 / 370 | 0 | VIP only |

Existing PACKAGE contracts: **only** the Large Bus pilot (`66f5de06-…`, USD, 525? no — 656).
Non-Alpha suppliers (Almushtari, Desert Compass) are **JOD** (FX) → excluded for the USD-first pilot.

## 1. Candidate evaluation
- **Medium Bus / Alpha / USD (Medium 30)** — supplier Alpha `3f63311b-…`, vehicleClass `Medium Bus`,
  vehicle **Medium 30** `da68f987-…`, USD, full-day **525** / half **307**, 22 P2P, airports separate,
  **17 real quote-items** (the most real usage of any unused-yet class — appears in actual multi-day
  itineraries). VIP variant **Large VVIP 29** (1069/674) shares the class but is **isolatable** by the
  vehicle allowlist (allow only Medium 30). 25% discount applies. ✅ strongest candidate.
- **Mini Van / Alpha / USD (Mini Van 5)** — most usage (22), no VIP in the USD set, but a 5-seat van;
  package/min-3-full-day disposal pricing is commercially marginal for a small van (daily 153). Lower
  priority.
- **Small Mini Bus / Alpha / USD** — no VIP, but **two standards with different prices** (Van 12 302
  vs Small 17 334) in one class → a single class-level package rate can't represent both; would need
  the contract to pick one + allowlist that vehicle only. Low usage (4 / 0). Possible but messier.
- **Van / Alpha / USD** — only Van VIP 9 (VIP); no standard. Skip.
- **Almushtari / Desert Compass** — JOD only → defer until FX is handled.

## 2. Commercial suitability (recommended candidate: Medium Bus / Medium 30)
- Clear **full-day rate** 525 and **half-day rate** 307 (USD). ✅
- Package-style daily rate present (DAILY_FULL_DAY = 525). ✅
- Airport transfers **separate** (AIRPORT_TRANSFER rows distinct; excluded by default). ✅
- Stationary/overnight/add-ons exist as ADD_ON rows (STATIONARY_WAITING, EXTRA_KM) → these remain
  **blocked** in live apply (PR 11A/B gates), so no complication for validation. ✅
- Supplier discount **25%** applies (same as the Large Bus pilot). ✅
- **Enough data:** 17 real Medium 30 quote-items for read-only shadow validation; throwaway test quote
  for controlled flag-ON. ✅
- **Conflation risk:** Large VVIP 29 (1069) in the same class — mitigated by the vehicle allowlist
  (Medium 30 only); the PR 11B-2B enforcement already blocks non-allowlisted vehicles. ✅

## 3. Recommended next pilot
**Alpha Medium Bus, USD, standard vehicle "Medium 30" (`da68f987-ce15-469a-8a65-50c2ee2bbca3`).**
Reasons: USD (no FX), clear full+half day rates, real quote usage (best validation data after the
Large Bus pilot had none), 25% discount, the one VIP variant is cleanly isolatable by the existing
vehicle allowlist, and it mirrors the proven Large Bus pilot exactly one size down.

## 4. Package contract proposal (for PR 11B-3B — create, separate approval)
| Field | Value |
|---|---|
| supplier | Alpha Bus and Limo Co `3f63311b-021f-432a-8ff8-fc5d5f407ad0` |
| vehicleClass | `Medium Bus` |
| regime | `PACKAGE_MIN_FULL_DAY` |
| minimumFullDays | 3 |
| minimumDayPolicy | `INELIGIBLE_UNDER_MIN` (match pilot) |
| fullDayRate | **525** (Medium 30 DAILY_FULL_DAY USD) |
| halfDayRate | **307** (Medium 30 HALF_DAY USD) |
| currency | USD |
| supplier discount | 25% applied at pricing (net = gross × 0.75), exactly once (engine behavior, not stored on contract) |
| validity | align with the Medium 30 USD rate validity window (read at creation); pilot used 2026-04-01..12-31 |
| active / status | active = true, pilot (allowlist-gated, flag OFF) |
| notes | "Standard Medium 30 only — NOT Large VVIP 29 (1069/674)" |
| allowed vehicle | **Medium 30** `da68f987-ce15-469a-8a65-50c2ee2bbca3` |

## 4b. Allowlist proposal (for PR 11B-3C)
Add to `PACKAGE_VEHICLE_ALLOWLIST`: `'<new-medium-contract-id>': ['da68f987-ce15-469a-8a65-50c2ee2bbca3']`.
**Critical code change beyond the map entry:** `computeQuotePackageLiveApply` currently hard-pins to a
SINGLE id (`PILOT_PACKAGE_CONTRACT_ID`). To enable a second contract, that pin must be **generalized
to "selected contract id is a key in `PACKAGE_VEHICLE_ALLOWLIST`"** (a contract allowlist), keeping
the vehicle gate. The shadow auto-resolves the Medium contract for Medium-Bus quotes already (it
findFirst by supplier+class+regime+active); the diagnostic `allowlist` block needs the Medium contract
in the map to report `allowed` for Medium 30.

## 5. Validation plan (PR 11B-3D)
1. **Shadow-first, flag OFF** (read-only): run `package-pricing-shadow` on (a) a **real** Medium 30
   quote (read-only — no mutation) to confirm `packageContractId` = new Medium contract, eligible,
   airport excluded, `allowlist.allowed` for Medium 30; and (b) construct the numbers by hand
   (525/307/25%).
2. **Throwaway test quote** (one, clearly titled `TEST — Alpha Medium Bus Package Pilot — DO NOT USE`):
   - Scenario-A-style: 3× DAILY_FULL_DAY Medium 30 + airport days → delta ≈ 0 (package == discounted
     daily card) — deterministic correctness.
   - Scenario-B-style: 3× **retained P2P** Medium 30 days (high route cost) + airport excluded →
     **negative delta** (saving). Exact P2P legs/prices read at validation (Medium 30 has 22 P2P).
3. **Controlled flag-ON validation** on the throwaway test quote ONLY (the proven 2-phase script:
   preflight asserts → flag ON recompute → flag OFF restore in finally), after explicit approval.
   **Never on real business quotes.**
4. **VIP isolation check:** a Large VVIP 29 quote under the Medium contract must report
   `vehicle-not-allowlisted` (shadow) and block in live apply.
5. **Rollback/cleanup:** clear selection; reset metadata; keep/delete the test quote per instruction;
   flag OFF; remove the allowlist entry to disable. No DB rollback beyond the contract (active=false).

## 6. Risks
- **VIP/premium conflation** (Large VVIP 29 1069 in Medium Bus) — mitigated by the Medium-30-only
  allowlist + PR 11B-2B enforcement; explicit isolation test.
- **JOD/cross-currency** — excluded (USD-only candidate); cross-currency blocked.
- **Missing/mixed vehicle ids, mixed suppliers, stationary/overnight** — all already blocked by the
  PR 11A/11B-2B gates.
- **Old `excursionPackageRate` overlap** — the live-apply overlap guard already blocks; retirement is
  PR 13.
- **Supplier discount ambiguity** — Medium 30 is Alpha (25%), same engine path as the pilot; net =
  gross × 0.75 applied once (verified pattern).
- **DAILY_FULL_DAY == fullDayRate → delta 0** for the Scenario-A-style test (expected; correctness,
  not saving) — the Scenario-B retained-P2P test gives the visible negative delta.
- **Contract-pin generalization** (single-id → allowlist-keys) is a real code change in 11B-3C — risk
  of accidentally widening; mitigate by deriving the pin from the same allowlist map (closed set) +
  regression tests proving only listed contracts apply.
- **Validation on real quotes** — shadow only (read-only) for real Medium 30 quotes; flag-ON strictly
  on a throwaway test quote.

## 7. Recommended PR split (matches your proposal)
- **PR 11B-3A — docs/audit only** (this plan). No code.
- **PR 11B-3B — create ONE pilot package contract** (Alpha Medium Bus USD, Medium 30 rates) via an
  idempotent script (like `create-pilot-package-contract`). Separate approval; creates one contract.
- **PR 11B-3C — generalize the contract pin to the allowlist + add the Medium contract → Medium 30**
  entry (code + tests). Live apply then accepts the Medium contract for Medium 30 only; flag OFF.
- **PR 11B-3D — shadow + controlled validation** (throwaway test quote; flag-ON validation reversed
  in-run). Separate approval.
- **PR 12** driver overnight + stationary · **PR 13** retire `excursionPackageRate` overlap.

Recommendation: **PR 11B-3A now (docs)**, then 11B-3B (contract), 11B-3C (allowlist + pin
generalization), 11B-3D (validation) — each separately approved.

## Acceptance criteria (for the eventual 11B-3 chain)
- New pilot is **Alpha Medium Bus USD / Medium 30** only; Large VVIP 29 blocked.
- Live apply accepts the Medium contract **only** for Medium 30 (allowlist), USD, all PR 11A/11B-2B
  gates passing; everything else blocked.
- Flag stays OFF until a separate controlled validation + explicit activation approval.
- No QuoteItem mutation; `quotes.service.ts` untouched; supplier discount applied once.
- Shadow and live apply agree (same allowlist helper); only-listed-contracts apply (regression).

## Strictly not in this step
No code/schema/migration/DB/flag/quote/contract changes; no new PACKAGE contracts; no production
activation; no PR 12/13; no quote-WIP stash; no dana; `proposal-v3-pdf-export.test.ts` excluded.
