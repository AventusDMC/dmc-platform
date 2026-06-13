# PR 5 — Package-Eligibility Runtime SHADOW Hook: Verification

**Date:** 2026-06-13
**Branch:** `transport-contract-regime-pr5` (from current `origin/main`)
**Option chosen:** A — debug-only endpoint (no edit to `quotes.service.ts` / live pricing).

PR 5 adds a **read-only, flag-gated** diagnostic endpoint that runs the PR 3 classifier +
PR 4 evaluator against a quote and returns "would this be package-eligible?" It changes
**no** pricing, quote total, supplier, or method, and persists nothing.

## Endpoint
`GET /transport-pricing/quotes/:id/package-eligibility-shadow`
- Auth: global `GlobalAuthGuard` + `RolesGuard`, restricted to **`@Roles('admin','finance')`**
  (not public — matches the existing sensitive-GET pattern in this controller).
- Flag `transport.packageEligibilityShadow` (env `TRANSPORT_PACKAGE_ELIGIBILITY_SHADOW`),
  **default OFF**.

## Feature-flag behavior
- **OFF (default):** endpoint returns `{ "enabled": false, "flag": "transport.packageEligibilityShadow" }`
  and the shadow service is **not run** (returns null before any query/classification).
- **ON:** endpoint returns `{ "enabled": true, ...diagnostics }` (read-only).

## Diagnostic shape
```
{
  enabled: true,
  quoteId,
  flag: 'transport.packageEligibilityShadow',
  contract: { found, supplierId?, vehicleClass?, currency?, minimumFullDays?, minimumDayPolicy? },
  eligibility: { eligible, reason, countedFullPackageDays, minimumFullDays, minimumDayPolicy,
                 billedAtMinimum, billedDays, manualRequiredDays },
  dayPlan: [ { dayNumber, operationalType, vehicleRetained, retentionReason,
              retentionCandidate, packageDayWeight, countsAsFullPackageDay, billedAs } ],
}
```
Covers every requested field: packageEligible (`eligibility.eligible`), reason,
countedFullPackageDays, billableDays (`billedDays`), billedAtMinimum, manualRequiredDays,
contract found/used, per-day operationalType, vehicleRetained, retentionReason,
retentionCandidate, packageDayWeight, billedAs.

## Sample outputs (verified by tests)
**Flag OFF:** `{ "enabled": false, "flag": "transport.packageEligibilityShadow" }`

**Flag ON, 3 touring days + PACKAGE contract (min 3):**
`contract.found=true`, `eligibility.eligible=true`, `eligibility.countedFullPackageDays=3`,
`dayPlan.length=3`.

**Flag ON, 2 touring days + PACKAGE contract (min 3):**
`eligibility.eligible=false`, `eligibility.reason='below-minimum'`.

**Flag ON, carrier days, NO PACKAGE contract (today's state):**
`contract.found=false`, `eligibility.reason='no-package-contract'`.

**Flag ON, 3 same supplier+vehicle P2P, no release signal:**
`eligibility.countedFullPackageDays=0`, `eligibility.manualRequiredDays=3`,
`eligibility.eligible=false` (adjacency-only candidates are never auto-counted).

## Mapping note (conservative by design)
Quote days → classifier inputs are inferred read-only from existing item data
(touring → TOURING_ROUTE; FULL_DAY/HALF_DAY classification; AIRPORT/STATIONARY/STANDBY
codes; else POINT_TO_POINT; no transport item → FREE_DAY_NO_VEHICLE). **No per-day
retention fields exist yet**, so P2P retention defaults to candidate/released — the shadow
*under-counts* retained P2P on purpose until a later schema PR adds retention capture.

## Tests / build
- `package-eligibility-shadow.service.test.ts` — **8 tests, all passing** (flag OFF disables;
  flag ON diagnostics; eligible/below-minimum/no-contract; manual-required not auto-counted;
  retained 3-day eligible at the diagnostic level; pure mapper).
- `nest build` passes (controller + service + app.module wiring + test files compile).

## Confirmation — no live behavior changed
- **`quotes.service.ts` is byte-for-byte unchanged** (empty git diff vs main);
  `calculateCreateOrUpdateQuoteItemServiceCost` and `recalculateQuoteTotals` untouched.
- Shadow service is **strictly read-only** (the test's fake Prisma exposes only `findMany`/
  `findFirst`; any write would throw). No mutation of quote/quote-item; no persistence.
- No schema/DB/migration; no `DAILY_PACKAGE`; no `PACKAGE_MIN_FULL_DAY` contracts; no
  overnight/stationary charging; no min-day enforcement in live pricing.
- Inert by default (flag OFF) AND, even ON, returns `no-package-contract` everywhere
  because zero `PACKAGE_MIN_FULL_DAY` contracts exist.

## Files
| File | Type |
|---|---|
| `apps/api/src/transport-pricing/transport-feature-flags.ts` | new (flag helper) |
| `apps/api/src/transport-pricing/package-eligibility-shadow.service.ts` | new (read-only shadow + mapper) |
| `apps/api/src/transport-pricing/package-eligibility-shadow.service.test.ts` | new (8 tests) |
| `apps/api/src/transport-pricing/transport-pricing.controller.ts` | modified (flag-gated debug GET) |
| `apps/api/src/app.module.ts` | modified (register shadow service provider — DI wiring only) |
| `docs/transport-pr5-shadow-hook-plan-2026-06-13.md` | new (plan) |
| `docs/transport-pr5-shadow-hook-verification-2026-06-13.md` | new (this) |

## Rollback
Flag OFF fully disables the shadow path (instant, env-only). No schema → no DB rollback;
reverting the PR removes the endpoint/service/flag cleanly. Live pricing was never touched.
