# PR 11B — Expand package live-apply beyond the pilot (PLAN ONLY)

**Date:** 2026-06-14
**Status:** PLAN ONLY — no code/DB/migration/flag/quote/contract changes.
**Builds on:** PR 11A (live apply pinned to one contract `66f5de06-…`, flag `transport.packagePricingLiveApply` default OFF).

## Checkpoint record (PR 11B-1, 2026-06-14)
1. **Only one `PACKAGE_MIN_FULL_DAY` contract exists today** (the Alpha Large Bus USD pilot).
2. **PR 11A live apply is still pinned to the single pilot contract `66f5de06-28df-426c-90b8-ffaa01ed5c5f`.**
3. **Production live-apply flag `transport.packagePricingLiveApply` remains OFF** (default; not set in any env).
4. **Supplier/class expansion is UNSAFE until vehicle-aware allowlisting exists** (class-level package
   contracts cannot distinguish standard vs VIP vehicles in the same class).
5. **Alpha Large Bus VIP/VVIP/Grand Star vs standard Large 49 is the main blocker** — a class-level
   package rate would mis-price VIP 31‑33 at the standard Large 49 package rate.
6. **PR 11B-2** = vehicle-aware allowlist + validation logic, **shadow-first** (no class enabled by default).
7. **PR 11B-3** = one additional supplier/class pilot **only after commercial sign-off** (+ a new contract).
8. **PR 12** remains driver overnight + stationary pricing.
9. **PR 13** remains retiring the legacy `excursionPackageRate` overlap.

This PR (11B-1) is **documentation only** — no code, schema, migration, DB write, flag change, quote
mutation, or contract creation.

## 0. Grounding audit (read-only, 2026-06-14) — the facts that shape this plan
- **Only ONE `PACKAGE_MIN_FULL_DAY` contract exists** (the Alpha Large Bus USD pilot). Every other
  supplier/class has only `ROUTE_TRANSFER`. → Expansion needs **new PACKAGE contracts** (data, not code).
- **Vehicle-class conflation is the #1 blocker.** Classes mix standard and VIP/VVIP vehicles under
  one `vehicleClass`, but PACKAGE contracts are **class-level**:
  - `Large Bus / Alpha`: **Large 49**, Large VIP 31‑33, Mercedes Grand Star 31, Mercedes Grand Star 49
  - `Medium Bus / Alpha`: Medium 30, Large VVIP 29, Mercedes Grand Star VIP, Alpha Medium Coach 30
  - `Mini Van / Alpha`: Mini Van 5, Hyundai Staria, Mercedes V‑Class VIP, V‑Class VVIP
  - `Van / Alpha`: Mercedes Sprinter VIP, Van VIP 9
  - `Small Mini Bus / Alpha`: Van 12, Small 17, Hyundai H350, Toyota Coaster (no obvious VIP)
  → A VIP quote in "Large Bus" would resolve to the **standard** pilot rate (656) and be **under-priced**.
  **This risk exists even for enabling PR 11A on real quotes**, not only for expansion.
- **Currency duality:** Alpha has BOTH USD and JOD `ROUTE_TRANSFER` contracts per class; Almushtari &
  Desert Compass are **JOD-only**. → cross-currency/FX must be handled or blocked.
- **Discounts:** only **Alpha = 25%**; all others 0%.

> Headline conclusion: **do not broaden by supplier+class yet.** The class taxonomy is too coarse
> (standard vs VIP share a class), so any class-level package rate mis-prices VIP vehicles. PR 11B
> must first make apply **vehicle-aware** (or subdivide classes) and add an explicit **allowlist**.

---

## 1. Expansion scope
- **Activation key (recommended): a two-part allowlist — `{contractId} + {allowed vehicleId(s)}`**, not
  supplier+class alone. PR 11A's single-id pin generalizes to a **contract-id allowlist**, PLUS a
  **vehicle-identity guard** that asserts the quote's primary `vehicleId` is in the contract's allowed
  set. Supplier+class matching stays as a *necessary* gate but is **not sufficient** (VIP shares class).
- **Avoiding VIP 31‑33 mis-pricing:** the vehicle-identity guard is the fix — an Alpha-Large-Bus PACKAGE
  contract is allowed to apply only when the resolved primary vehicle is **Large 49** (and any other
  explicitly-listed standard vehicle), never VIP 31‑33 / Mercedes Grand Star unless those have their own
  contract/rate. (Alternative, heavier: subdivide `Large Bus` → `Large Bus Standard` / `Large Bus VIP` —
  taxonomy + backfill; deferred.)
- **First candidates to *consider* (commercial sign-off required):** clean (no-VIP) USD Alpha classes —
  e.g. **Alpha Small Mini Bus USD** (all standard) — but only if package full-day pricing is commercially
  meaningful for that size. Large/VIP classes stay blocked until vehicle-aware.

## 2. Contract readiness
- **Has PACKAGE data:** only Alpha Large Bus USD (pilot) — and even that needs the vehicle guard to be
  safe for VIP-sharing class.
- **Needs new PACKAGE contracts (prerequisite, separate approval):** any other supplier/class chosen for
  expansion (e.g. Alpha Small Mini Bus USD; Almushtari classes in JOD). Contract creation is **out of
  PR 11B implementation scope** — it is a data prerequisite the user must approve, like the PR 8 pilot.
- **Should remain blocked:** all VIP/VVIP vehicles (until vehicle-specific contracts/rates exist); all
  classes with no PACKAGE contract; JOD until FX is explicit (§3).
- **Validate a package contract before live apply** (per contract): supplier+class+currency+active;
  fullDayRate/halfDayRate present & positive; minimumFullDays sane; the contract's intended standard
  vehicle(s) identified and allow-listed; a **shadow run on a representative quote** matches a hand
  cross-check (the §8 of the validation playbook used for the pilot).

## 3. Currency / FX
- **PR 11B stays USD-only.** Package apply runs only when quote currency == contract currency == USD.
- **JOD suppliers (Almushtari, Desert Compass, Alpha-JOD) excluded** until FX handling is explicit
  (a later PR): no implicit conversion between the persisted (quote-currency) baseline and a
  different-currency contract rate.
- **Cross-currency quotes blocked** with reason `cross-currency` (already enforced in PR 11A); keep.

## 4. Vehicle/rate nuance (the core design decision)
- **Problem:** multiple vehicles with different prices live in one `vehicleClass` (Large 49 656 vs VIP
  31‑33 ~930/585). A class-level PACKAGE contract can't tell them apart.
- **Options:**
  - **A (recommended, smallest safe step): in-code allowlist `contractId → allowedVehicleIds`** consumed
    by the apply path; block if the quote's primary vehicle isn't listed. No schema change.
  - **B: add an allowed-vehicle dimension to `TransportContract`** (e.g. `vehicleId` nullable or a join) —
    schema + migration; cleaner long-term, heavier.
  - **C: subdivide vehicle classes** (Standard vs VIP) — taxonomy + backfill across vehicles/rates.
- **Recommendation:** start with **A** in PR 11B-2 (in-code allowlist + vehicle guard, shadow only), and
  evaluate B/C as a separate prerequisite if/when expansion broadens. **Package contracts should become
  effectively vehicle-scoped (via allowlist or schema) before any non-pilot class is enabled.**

## 5. Safety gates (all retained from PR 11A, plus new ones)
- **Feature flag** `transport.packagePricingLiveApply` stays the master switch, default OFF.
- **Contract allowlist** (replaces the single hard-coded id): only contracts on the list may apply.
- **Vehicle allowlist** per contract (new): primary `vehicleId` must be allow-listed → blocks VIP.
- **Supplier/class allowlist** as an additional coarse gate (defense in depth).
- **Quote status restriction:** consider limiting initial real activation to DRAFT/quoting quotes
  (not converted/booked) — to be decided before any production enablement.
- **Manual selection requirement:** apply only when a planner explicitly saved a PACKAGE selection
  (no automatic selection — unchanged).
- **Stale selection** (`selectionStale`) → block (unchanged).
- **Manual-required days** → block (unchanged).

## 6. Pricing rules (unchanged from PR 11A, generalized per contract)
- **Full-day rate** = the matched contract's `fullDayRate`; **half-day** = `halfDayRate` (per contract
  policy flags). **Excluded transfers** (airport/released/etc.) keep their existing persisted cost (not
  in the delta). **Supplier discount applied exactly once** (contract supplier's `transportDiscountPercent`).
- **Sell-side:** weighted-average markup of the replaced transport lines (D1a) — unchanged.
- **Delta applied at total-assembly only; no QuoteItem mutation** (D2a) — unchanged.
- Generalization: the only change vs 11A is *which* contract is selected (allowlist + vehicle guard +
  USD gate) — the math path is identical and already proven.

## 7. Blockers — confirm these remain blocked unless separately handled
driver overnight · stationary / standby · ADD_ON overnight rows · `excursionPackageRate` overlap · slab
mode · mixed supplier · mixed currency · missing package contract · ineligible package selection — **all
remain hard blocks** (carried from PR 11A). New blocks added: **non-allowlisted contract** and
**non-allowlisted vehicle (VIP)**.

## 8. Tests (for the eventual 11B-2 implementation)
- non-allowlisted contract → blocked (`not-allowlisted-contract`).
- allowlisted contract + allowlisted standard vehicle → applies.
- **VIP 31‑33 quote (same class, non-allowlisted vehicle) → blocked** (`vehicle-not-allowlisted`).
- JOD / cross-currency quote → blocked.
- stale contract → blocked; manual-required days → blocked; stationary/overnight/ADD_ON → blocked.
- supplier discount applied exactly once; weighted-markup sell delta correct.
- **QuoteItems not mutated** (count + sum unchanged); flag OFF → baseline (rollback).
- no automatic cheapest selection (apply only from saved selection).
- allowlist is a closed set: a contract/vehicle not listed never applies.

## 9. Rollout (staged, no broad production activation)
1. **Shadow first:** for each candidate supplier/class, create the PACKAGE contract (separate approval),
   run the read-only pricing-shadow on a representative quote, hand cross-check (656/halfday/discount/
   exclusions), confirm the vehicle guard rejects VIP.
2. **Controlled allowlist:** add the validated contract+vehicle to the in-code allowlist (11B-2).
3. **Per-supplier/class validation** (mirror the PR 11A pilot playbook): build a throwaway test quote,
   shadow → save selection → controlled flag-ON validation on that test quote only → restore.
4. **No broad production activation** — flag stays OFF in prod; enabling for real quotes is a separate,
   explicitly-approved step per supplier/class.
5. **Rollback:** flag OFF stops all apply; remove an entry from the allowlist to disable a specific
   contract/vehicle; totals restore on next recompute (additive delta, no item mutation). No DB rollback
   for code-only allowlist changes.

## 10. Recommended PR split
- **PR 11B-1 — audit only (this doc + a written contract/rate/vehicle-class report).** Surfaces the
  PACKAGE-contract gap, the VIP/standard class conflation, and the FX/currency split. No code.
- **PR 11B-2 — allowlist + vehicle-aware validation logic (shadow only, no new class enabled).**
  Generalize the pin to a contract allowlist + per-contract vehicle allowlist + USD gate; keep flag OFF;
  add tests. Does NOT enable any non-pilot class (allowlist initially = just the pilot + its Large 49).
- **PR 11B-3 — one additional supplier/class pilot** (e.g. a clean no-VIP USD class), gated by 11B-2's
  allowlist, validated via the PR 11A playbook. Requires a new PACKAGE contract (separate approval).
- **PR 12 — driver overnight + stationary pricing** (still blocked until then).
- **PR 13 — retire the legacy `excursionPackageRate` / FULL_DAY mechanism** once the contract regime
  supersedes it.

Recommendation: do **11B-1 now (this audit)**, then **11B-2** (vehicle-aware allowlist, inert/shadow),
and only then consider 11B-3 once a clean contract+vehicle target and commercial sign-off exist.

---

## File list (if/when 11B-2 is implemented)
- `apps/api/src/transport-pricing/package-eligibility-shadow.service.ts` — replace the single
  `PILOT_PACKAGE_CONTRACT_ID` with an **allowlist** (`Map<contractId, allowedVehicleIds[]>`); add the
  vehicle-identity guard + USD gate in `computeQuotePackageLiveApply`.
- `apps/api/src/transport-pricing/package-eligibility-shadow.service.test.ts` — §8 tests.
- (optional, Option B only) `apps/api/prisma/schema.prisma` + migration — allowed-vehicle dimension on
  `TransportContract` (deferred; only if in-code allowlist proves insufficient).
- `docs/` — 11B-2 verification doc.
No `quotes.service.ts` change needed (the recalc hook from PR 11A is reused unchanged).

## Data prerequisites (separate approvals, not in 11B code)
- A validated PACKAGE contract for each new supplier/class to enable.
- Identification of the **standard** vehicle(s) per contract for the allowlist (exclude VIP/VVIP).
- A decision on VIP handling (own contract/rate, or class subdivision) before any VIP-sharing class.
- FX policy before any non-USD package apply.

## Risks
- **VIP mis-pricing** (primary) — mitigated by the vehicle allowlist; do not enable class-level apply
  without it.
- **No PACKAGE contracts exist** for non-pilot classes — expansion is data-gated, not code-gated.
- **FX ambiguity** for JOD — excluded until explicit.
- **Coarse class taxonomy** — long-term may need subdivision (Option C); track as a follow-up.
- **Over-broad allowlist** — keep it a small, explicitly-reviewed closed set; log what's enabled.
- **Commercial fit** — package/min-3-day pricing may not suit smaller classes; needs sign-off.

## Acceptance criteria (for 11B-2)
- Flag OFF → zero change anywhere (as PR 11A).
- With flag ON, apply happens **only** for an allow-listed contract **and** an allow-listed (standard)
  vehicle, USD, all PR 11A gates passing; everything else (VIP, non-USD, non-listed contract, stale,
  ineligible, manual-required, stationary/overnight/ADD_ON, slab, overlap) → existing pricing.
- No QuoteItem mutation; flag-OFF restores baseline on recompute.
- No new class enabled by default (allowlist = pilot only until a 11B-3 target is approved).
- No schema/migration (Option A); all existing + new tests green.

## Strictly not in this step
No code/DB/migration/flag/quote/contract changes; no PR 12/13 work; no production activation; no
quote-WIP stash; no dana files; `proposal-v3-pdf-export.test.ts` stays excluded.
