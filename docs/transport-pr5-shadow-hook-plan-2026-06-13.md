# PR 5 — Runtime Shadow Hook for Package Eligibility (PLAN ONLY)

**Date:** 2026-06-13
**Status:** PLAN ONLY — no code/schema/migration/DB change. For approval before PR 5.
**Builds on:** PR 3 classifier + PR 4 evaluator (both pure, merged, inert on main).

## 1. Goal
Run the PR 3 classifier + PR 4 evaluator at runtime as a **shadow/diagnostic** path only —
compute "would this quote be package-eligible?" and log/return it, **without** changing any
live pricing, quote total, supplier, or method. No live package pricing, no
`DAILY_PACKAGE`, no enforcement.

## 2. Safety mode — feature flag, default OFF
- Flag: **`transport.packageEligibilityShadow`** (env var `TRANSPORT_PACKAGE_ELIGIBILITY_SHADOW`,
  default **OFF**). Read once via a tiny helper.
- **Flag OFF → absolutely nothing runs** (guard returns before any classify/evaluate/log).
- **Flag ON → diagnostics only** (classify + evaluate + log/return). Never feeds back into cost.

## 3. Hook location — two options (please pick one)

**Option A — debug-only endpoint (RECOMMENDED, zero live-file edit).**
- New read-only method `evaluateQuotePackageEligibilityShadow(quoteId)` on a new
  `PackageEligibilityShadowService`, exposed via a new flag-gated route on the existing
  `@Controller('transport-pricing')`:
  `GET /transport-pricing/quotes/:id/package-eligibility-shadow` (returns 404/disabled when
  flag OFF).
- **No edit to `quotes.service.ts`, `recalculateQuoteTotals`, or
  `calculateCreateOrUpdateQuoteItemServiceCost`.** Shadow runs only when the debug endpoint
  is called. Maximum safety; nothing automatic.

**Option B — automatic hook in `recalculateQuoteTotals` (matches "flag ON → it runs").**
- Add **one flag-gated line at the END** of `recalculateQuoteTotals(quoteId)` (after totals
  are computed and persisted): `if (flag) await shadow.evaluateAndLog(quoteId)`. The call is
  read-only and its result is **discarded** (logged only) — totals already finalized above
  it are returned unchanged.
- This is the literal "runtime shadow hook." It edits one live function (a single guarded,
  post-computation, result-discarded call) — covered by a test asserting totals are
  byte-for-byte identical with the flag ON vs OFF.

Either way: **`calculateCreateOrUpdateQuoteItemServiceCost` is NOT touched**, and the old
route/transfer/full-day/`excursionPackageRate` pricing is untouched. *Recommendation: ship
Option A (debug endpoint) first; add Option B's one-line auto-hook only if you want
shadow-on-every-recompute.*

## 4. Diagnostic output (what the shadow returns/logs)
```
QuotePackageEligibilityShadow {
  quoteId,
  flag: 'transport.packageEligibilityShadow',
  contract: { found: boolean, supplierId?, vehicleClass?, currency?, regime?, minimumFullDays?, minimumDayPolicy? } | { found:false },
  eligibility: {            // from PR4 evaluatePackageEligibility
    packageEligible: boolean,
    reason: 'no-package-contract' | 'below-minimum' | null,
    countedFullPackageDays: number,
    minimumFullDays: number | null,
    billableDays: number | null,     // billedDays (CHARGE_MINIMUM_DAYS or counted)
    billedAtMinimum: boolean,
    manualRequiredDays: number,
  },
  dayPlan: [                // from PR3 classifyItinerary (per day)
    { day, operationalType, vehicleRetained, retentionReason, retentionCandidate,
      packageDayWeight, countsAsFullPackageDay, billedAs }
  ],
}
```
Includes everything requested: packageEligible, reason, countedFullPackageDays, billableDays,
manualRequiredDays, no-package-contract / below-minimum, day-by-day classification,
retentionReason, packageDayWeight, and the contract used / no-contract-found.

**Quote-day → classifier mapping** (read-only, no new fields): operational type inferred
from existing item/service-type/touring data (touring item → TOURING_ROUTE; full-day service
type → FULL_DAY_SERVICE; transfer → POINT_TO_POINT or AIRPORT_TRANSFER; etc.); supplier/
vehicle keys from item data; **retention conservative** (no per-day retention fields exist
yet → released/candidate by default, never auto-retained). Accurate live retention needs a
later schema PR — the shadow is explicitly conservative until then.

## 5. Storage / logging — DO NOT PERSIST (recommended)
- PR 5 **logs** diagnostics (structured logger line) and, for Option A, **returns** them in
  the debug-only endpoint response. **Stores nothing** — no shadow table, no schema change.
- A persisted shadow table (for batch comparison) is deferred to a later PR only if we find
  we need historical diffs; it would be proposed + approved separately.

## 6. Tests
- Flag OFF → hook/endpoint is a no-op: shadow service not invoked; (Option B) totals
  identical; (Option A) endpoint disabled.
- Flag ON → diagnostics generated (unit-test the shadow service + mapping with a fake Prisma).
- **Quote total unchanged** — `recalculateQuoteTotals` output identical flag ON vs OFF.
- **Supplier unchanged**, **pricing method unchanged** (same assertion set).
- No PACKAGE contract → diagnostic `reason: no-package-contract`.
- Below minimum → diagnostic only (`below-minimum`, eligible false), no cost effect.
- Manual-required days do not auto-count (`manualRequiredDays > 0`, not added to counted).
- Retained 3-day block → `packageEligible: true` **diagnostically only**.

## 7. Rollback plan
- Turning the flag OFF fully disables the shadow path (guard short-circuits). Instant,
  no deploy needed beyond the env change.
- **No schema/migration in PR 5 → no DB rollback needed.** Reverting the PR removes the
  shadow service/endpoint cleanly; live pricing was never touched.

## File list (proposed)
| File | Type |
|---|---|
| `apps/api/src/transport-pricing/package-eligibility-shadow.service.ts` | new (read-only shadow + quote-day mapping) |
| `apps/api/src/transport-pricing/package-eligibility-shadow.service.test.ts` | new (tests, fake Prisma) |
| `apps/api/src/transport-pricing/transport-feature-flags.ts` | new (tiny env-flag helper, default OFF) |
| `apps/api/src/transport-pricing/transport-pricing.controller.ts` | **Option A only** — modified: add flag-gated debug GET route |
| `apps/api/src/quotes/quotes.service.ts` | **Option B only** — modified: one flag-gated, result-discarded line at end of `recalculateQuoteTotals` |
| `docs/transport-pr5-shadow-hook-plan-2026-06-13.md` (this) + verification doc | docs |

*(Exactly one of the controller / quotes.service edits, depending on Option A vs B.)*

## Logic flow (shadow service, read-only)
```
if (!flag.packageEligibilityShadow) return null            // OFF → nothing
quote = load quote + transport days + supplier/vehicle (read-only)
contract = find PACKAGE_MIN_FULL_DAY TransportContract for supplier+vehicleClass(+currency)  // none today → null
days = mapQuoteDaysToItineraryInput(quote)                 // conservative, no new fields
classified = classifyItinerary(days, contractPolicy)       // PR3
verdict = evaluatePackageEligibility(classified, contract) // PR4
log/return { quoteId, contract, verdict, dayPlan: classified.days }   // discard for pricing
```

## Risks & mitigations
| Risk | Mitigation |
|---|---|
| Shadow accidentally affects totals | Result discarded; (B) call is after totals finalized; test asserts identical totals flag on/off |
| Editing a live function (Option B) | Single guarded post-computation line; or choose Option A (no live-file edit) |
| Mapping inaccuracy (no retention fields) | Shadow is conservative/diagnostic; accurate retention deferred to a later schema PR |
| Flag left ON in prod | Default OFF; only logs/returns diagnostics — no behavior change even if ON |
| `nest build` compiles new `.test.ts` | Proven node:test import style; run `npm run build` before PR |

## Acceptance criteria
- Flag OFF → zero behavior change (no shadow run); Flag ON → diagnostics only.
- Quote total, supplier, and pricing method identical with flag ON vs OFF.
- `calculateCreateOrUpdateQuoteItemServiceCost` untouched; old pricing untouched.
- No schema/DB/migration; no `DAILY_PACKAGE`; no `PACKAGE_MIN_FULL_DAY` contracts; no
  overnight/stationary charging; no min-day enforcement in live pricing; no persisted
  diagnostics; no quote-builder UI (debug endpoint is API-only).
- Tests pass; `nest build` passes; PR contains only the approved files.

## Is PR 5 live-affecting?
**No — when the flag is OFF (its default), behavior is identical to today.** With the flag
ON it only computes + logs/returns diagnostics; it still cannot change pricing because (a)
the result is discarded and (b) zero `PACKAGE_MIN_FULL_DAY` contracts exist. The first
genuinely live-affecting step (pricing wiring) remains a later, separately-approved PR.

## Open decision for you
- **Option A vs B** for the hook (recommend A: debug endpoint, zero live-file edit).
- Confirm **no persistence** (recommended) for PR 5.
