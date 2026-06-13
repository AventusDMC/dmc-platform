# PR 4 — Package Eligibility / minimumFullDays Evaluation (PLAN ONLY)

**Date:** 2026-06-13
**Status:** PLAN ONLY — no code, schema, migration, or DB change. For approval before PR 4.
**Builds on:** PR 3 shadow classifier (`common/transport-day-classification.ts`), PR 2
`TransportContract` layer.

## 1. Exact goal of PR 4
Wire the PR 3 day-classifier into a **package-eligibility / `minimumFullDays` evaluator**
that, for a given quote, computes counted full transport days and decides whether a
`PACKAGE_MIN_FULL_DAY` contract is eligible — **as a shadow/diagnostic only**.

Explicitly NOT in PR 4: activating package pricing for live quotes, creating
`PACKAGE_MIN_FULL_DAY` pilot contracts, activating `DAILY_PACKAGE`, charging driver
overnight, or removing the existing `excursionPackageRate`/`FULL_DAY` mechanism.

## 2. Proposed safety mode — fully shadow + flag-gated
PR 4 can be **fully inert for live behavior**, for two independent reasons:
1. **No `PACKAGE_MIN_FULL_DAY` contracts exist** (verified: PR 2 created only 17
   ROUTE_TRANSFER). So even if called, the evaluator returns *"no package option /
   ineligible: no contract"* for every quote → nothing to price.
2. The evaluator is **not wired into the live pricing path**
   (`calculateCreateOrUpdateQuoteItemServiceCost`). It is a separate, read-only function,
   optionally exposed behind a feature flag (`transport.packageEligibilityShadow`,
   default OFF) for logging/diagnostics.

Guarantees: existing route/transfer pricing unchanged · existing quote totals unchanged ·
no silent supplier/method change · the old `FULL_DAY`/`excursionPackageRate` path is left
exactly as-is (retired only in a much later PR).

## 3. Exact files/services to touch
**New (pure + tests + doc):**
- `apps/api/src/transport-pricing/package-eligibility.ts` — pure evaluator:
  `evaluatePackageEligibility(classifiedDays, { minimumFullDays, minimumDayPolicy })` →
  `{ eligible, reason, countedFullPackageDays, minimumFullDays, billedAtMinimum, billedDays }`.
  Pure; consumes PR 3's `classifyItinerary` output. No DB.
- `apps/api/src/transport-pricing/package-eligibility.test.ts` — unit tests (node:test,
  `import { test }` / `import * as assert` style; runs via `node --test --require ts-node/register`).
- `docs/transport-pr4-package-eligibility-verification-...md` — shadow examples + "no live change" proof.

**Modified (shadow read-only hook — only if we want runtime diagnostics in PR 4):**
- `apps/api/src/transport-pricing/transport-pricing.service.ts` — add a **read-only**
  `evaluateQuotePackageEligibilityShadow(quoteId)`: loads the quote's
  `PACKAGE_MIN_FULL_DAY` contract(s) for its supplier+vehicleClass (none today → returns
  ineligible), maps the quote's transport days to `ItineraryDayInput` (conservative
  inference from existing service-type/touring data — NO new DB fields), classifies,
  evaluates, and returns/logs the diagnostic. Called by **nothing** in the pricing flow.
  *(This method can be deferred to PR 5 to keep PR 4 a pure module + tests — recommended;
  see §7.)*

**NOT touched:** `quotes.service.ts` pricing computation (no edit to
`calculateCreateOrUpdateQuoteItemServiceCost`), `schema.prisma`, any migration, the DB,
quote-builder UI, DTOs that affect live requests. No quote WIP / dana files
(confirmed out of scope; both remain stashed/backed-up).

## 4. How the §14 locked rules apply (in the evaluator)
- **Minimum = counted full transport days** (sum of `packageDayWeight` from PR 3), not
  only touring days.
- **P2P retained vs released** — taken from PR 3 classification (`vehicleRetained`):
  retained → weight 1; released/lone → 0; adjacency-only candidate → 0 + `manual-required`
  (surfaced as "needs confirmation," never auto-counted).
- **Airport transfers separate by default** (weight 0) unless contract-included or
  reclassified upstream — already in PR 3.
- **Half-day does not count by default** (0); 0.5 only if `halfDayCountsTowardMin`; 1.0 if
  `halfDayChargedAsFullDay` — already in PR 3.
- **Stationary counts only by contract flag** (`stationaryCountsTowardMinDays`) — PR 3.
- **No driver overnight charging** in PR 4 (out of scope).
- **Below minimum:** `INELIGIBLE_UNDER_MIN` (default) → no package option;
  `CHARGE_MINIMUM_DAYS` → eligible but `billedAtMinimum = true`, `billedDays = minimumFullDays`.
  The evaluator only *reports* this; it does not price it in PR 4.

## 5. When no `PACKAGE_MIN_FULL_DAY` contract exists
The evaluator returns `{ eligible: false, reason: 'no-package-contract' }` → **no package
option**. The live route/transfer pricing path is never consulted by the evaluator and is
**unchanged**. This is the current state for every supplier+vehicleClass (0 package
contracts), so PR 4 is inert by construction.

## 6. Test plan
1. Existing quote pricing unchanged — snapshot a representative quote's computed transport
   cost before/after PR 4 → identical (the live path isn't touched).
2. Package contract below minimum (2 counted) + `INELIGIBLE_UNDER_MIN` → ineligible.
3. Package contract at 3 counted full days → eligible.
4. 3 retained P2P days → eligible (counted 3).
5. 2 days → ineligible by default.
6. `CHARGE_MINIMUM_DAYS` → eligible, `billedAtMinimum`, `billedDays = min` (only when set).
7. Airport-only transfers → do not count (eligible=false / counted 0).
8. Half-day default → does not count.
9. Stationary counts only when `stationaryCountsTowardMinDays`.
10. No PACKAGE contract → `no-package-contract`, no behavior change.

## 7. Rollout plan
- **PR 4 (this):** pure evaluator + tests + verification doc (shadow examples). Recommended
  to keep the runtime `evaluateQuotePackageEligibilityShadow` hook **deferred to PR 5** so
  PR 4 stays a pure, zero-integration module (lowest risk, like PR 3). If we want runtime
  diagnostics now, add it read-only behind `transport.packageEligibilityShadow` (default OFF).
- **Later (separate, explicitly approved):** create a pilot `PACKAGE_MIN_FULL_DAY` contract;
  add per-day retention fields if accurate live eligibility is needed; enable the flag to
  log shadow comparisons against real quotes; finally wire eligibility into pricing and
  retire the old `excursionPackageRate`/`FULL_DAY` mechanism.
- **No production behavior change** until we explicitly approve a later activation PR.

## File list (proposed)
| File | Type |
|---|---|
| `apps/api/src/transport-pricing/package-eligibility.ts` | new (pure) |
| `apps/api/src/transport-pricing/package-eligibility.test.ts` | new (tests) |
| `docs/transport-pr4-package-eligibility-verification-2026-06-13.md` | new (doc) |
| *(optional)* `transport-pricing.service.ts` shadow read-only method | modified — defer to PR 5 (recommended) |

## Logic flow (evaluator, pure)
```
classifiedDays = classifyItinerary(quoteDays, contractPolicy)   // PR3
counted = classifiedDays.countedFullPackageDays
if (!packageContract) return { eligible:false, reason:'no-package-contract' }
if (counted >= contract.minimumFullDays) return { eligible:true, countedFullPackageDays:counted, billedAtMinimum:false }
if (contract.minimumDayPolicy === 'CHARGE_MINIMUM_DAYS')
     return { eligible:true, billedAtMinimum:true, billedDays:contract.minimumFullDays, countedFullPackageDays:counted }
return { eligible:false, reason:'below-minimum', countedFullPackageDays:counted, minimumFullDays:contract.minimumFullDays }
```

## Risks & mitigations
| Risk | Mitigation |
|---|---|
| Accidental live pricing change | Don't touch `calculateCreateOrUpdateQuoteItemServiceCost`; evaluator wired into nothing; flag default OFF |
| Quote-day → classifier mapping inaccuracy (no retention fields yet) | PR 4 is shadow/diagnostic; conservative inference; accurate retention deferred to a later schema PR |
| Confusion with existing `FULL_DAY`/`excursionPackageRate` path | Leave old path untouched; document that new evaluator is parallel + inert until activation |
| `nest build` compiles the new `.test.ts` | Use the proven node:test import style; run `npm run build` before PR |

## Acceptance criteria
- New evaluator + tests added; all tests pass; `nest build` passes.
- Evaluator imported by nothing in the live pricing path (or only behind an OFF flag).
- A representative quote's transport cost is **identical** before/after PR 4.
- No schema/DB/migration; no `DAILY_PACKAGE`; no `PACKAGE_MIN_FULL_DAY` contracts; no
  overnight charging; no UI change; no unrelated files.

## Can PR 4 remain shadow/inert?
**Yes — fully.** As a pure evaluator (+ tests + doc) it touches no live path. Even the
optional runtime hook is read-only, flag-gated OFF, and returns "no package option"
everywhere because zero `PACKAGE_MIN_FULL_DAY` contracts exist. **Live pricing behavior
cannot change in PR 4.** Behavior changes only in a future, explicitly-approved activation
PR (pilot contract + retention data + flag-on + pricing wiring).
