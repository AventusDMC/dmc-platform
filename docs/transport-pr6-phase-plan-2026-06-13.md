# Transport Contract-Regime — Phase Plan from PR 6 (PLAN ONLY)

**Date:** 2026-06-13
**Status:** PLAN ONLY — no code/schema/DB/migration. For approval.
**Context:** PRs 1–5 merged (vehicleClass, migration repair, TransportContract +
ROUTE_TRANSFER backfill, shadow classifier, pure evaluator, runtime shadow endpoint).
All additive/inert; **zero live-pricing change so far.** This plan covers the remaining
work to eventually make package pricing live — **deliberately split so no single PR is a
big-bang live-pricing change.**

## Recommended split (each PR small; live-affecting steps isolated + flag-gated)
| PR | Title | Live-affecting? |
|---|---|---|
| **6** | Per-day retention **capture** — additive nullable metadata + shadow reads it | **No** (metadata only) |
| **7** | Planner **UI** to set retention/day-type per day | No (metadata only) |
| **8** | **Pilot** `PACKAGE_MIN_FULL_DAY` contract (data only), shadow-validated | No |
| **9** | Pricing **shadow-compare** — compute route vs package side-by-side, log/return, **do not apply** | No (totals unchanged) |
| **10** | **Surface options** in quote builder (route vs package, recommended, manual select) — flag-gated, selection stored but not auto-applied | Gated |
| **11** | **Activate** for piloted suppliers (flip flag) + retire old `excursionPackageRate`/`FULL_DAY` | **Yes — final, explicit** |

Only PRs 10–11 can change a quote total, and only behind a flag + explicit approval.

---

## 1. Per-day retention capture (PR 6 — the immediate next PR)

### What to represent (per itinerary day)
- `transportDayType` — optional override of the inferred operational type
  (`AIRPORT_TRANSFER | POINT_TO_POINT | HALF_DAY_SERVICE | TOURING_ROUTE | FULL_DAY_SERVICE |
  STATIONARY_FULL_DAY | STATIONARY_HALF_DAY | STANDBY_WAITING | FREE_DAY_NO_VEHICLE`).
- `vehicleRetained` (Bool?) — explicit retained override.
- `vehicleReleased` (Bool?) — release signal.
- `inRetainedBlock` (Bool?) — explicit package/retained block membership.
- Stationary / half-day / standby are expressed via `transportDayType`; manual-required is
  *derived* (adjacency candidate) — not stored.

### Where it belongs — `QuoteItineraryDay` (additive nullable, metadata-only)
Per-day is the natural grain for the two-axis model, and there's an exact precedent:
`QuoteItineraryDay.country` ("Location metadata only — never touches pricing"). Add the
fields the same way. **Not** on QuoteItem (multiple items/day complicates), **not** package
components (those are templates). *(Alternative: a 1:1 `QuoteTransportDay` table — cleaner
isolation but more infra; recommend the QuoteItineraryDay fields for simplicity.)*

### Schema proposal (PR 6 — additive, requires approval)
```
model QuoteItineraryDay {
  ... existing ...
  transportDayType  String?   // validated vs OperationalTransportType const; NULL = infer (today's behavior)
  vehicleRetained   Boolean?  // NULL = not asserted (conservative)
  vehicleReleased   Boolean?
  inRetainedBlock   Boolean?
}
```
All nullable → **NULL everywhere on deploy = identical to today** (shadow falls back to
inference). No DB enum (string validated against the const, per the vehicleClass precedent).
One additive migration via `migrate deploy` (production-safe flow). **No backfill** (NULL is
the correct default).

### Does it need schema changes? **Yes** — 4 additive nullable columns (one migration).
This is the first schema change since PR 2; flagged for your explicit approval. It remains
metadata-only and is read **only** by the shadow path in PR 6 (no pricing).

### PR 6 file list
| File | Type |
|---|---|
| `apps/api/prisma/schema.prisma` | +4 nullable fields on QuoteItineraryDay |
| `apps/api/prisma/migrations/<ts>_add_quote_day_transport_retention/migration.sql` | additive migration |
| `apps/api/src/transport-pricing/package-eligibility-shadow.service.ts` | read the new fields (override → fallback to inference) |
| `apps/api/src/transport-pricing/package-eligibility-shadow.service.test.ts` | tests for override vs inference |
| `docs/transport-pr6-retention-capture-verification-…md` | verification |

PR 6 acceptance: fields default NULL = no behavior change; shadow honors explicit fields
when set; `migrate status` clean; no pricing/quote total change; `quotes.service.ts` untouched.

---

## 2. Admin / planner input (PR 7 — metadata UI, no pricing)
- **Where:** the itinerary day editor `apps/admin-web/app/quotes/[id]/QuoteItineraryDayForm.tsx`
  (same place as the day `country`/title/notes). Add an optional "Transport day" section:
  day-type select (default **Auto**), "Vehicle retained / released" tri-state (default
  **Auto/unset**), retained-block checkbox.
- **Mark half-day / stationary / standby:** via the day-type select.
- **Prevent accidental auto-counting:** default is **Auto/unset → conservative** (not
  retained). Retention requires a deliberate planner choice; adjacency stays
  `manual-required` until confirmed. Needs a matching `/api/.../route.ts` proxy if the form
  posts to a new endpoint (per repo convention) — likely reuses the existing day-update path.
- Still metadata-only; pricing unchanged. (Source-grep `page.test.tsx` caution applies.)

## 3. Pilot `PACKAGE_MIN_FULL_DAY` contract (PR 8 — data only)
- **How:** create ONE contract via the admin contract path or a guarded one-off script
  (like the PR 2 backfill), `regime = PACKAGE_MIN_FULL_DAY`, `minimumFullDays = 3`,
  `minimumDayPolicy = INELIGIBLE_UNDER_MIN`.
- **Which supplier/vehicle first:** **Alpha + Large Bus (USD)** — the clearest real
  large-vehicle daily-package case (Alpha already has the full-day rates). Keep `active`
  but **not referenced by any pricing path** (pricing wiring doesn't exist until PR 9).
- **Keep out of live pricing:** it only becomes visible to the **shadow endpoint** (which
  reads PACKAGE contracts) — and the shadow never changes totals. Validate eligibility via
  `GET …/package-eligibility-shadow` on a test quote before any wiring.

## 4. Pricing wiring (PR 9–10 — FUTURE, do not implement)
- **Side-by-side:** an options resolver computes the **route/transfer** total (today's
  engine, unchanged) **and** the **package** total (eligible counted days × full-day rate)
  for the same trip, returning both with eligibility/reason.
- **No silent cheapest:** `recommended = cheapest ELIGIBLE` is a *hint*; the planner sees
  both options + method + supplier and **selects**. Manual override always wins and is
  stored on the quote.
- **Shadow-compare first (PR 9):** compute both, **log/return** the comparison, **do not
  change stored totals**. Only PR 10 surfaces + lets selection apply, behind a flag.

## 5. Safety / rollout
- **Feature flags:** keep `transport.packageEligibilityShadow` (PR 5); add
  `transport.packagePricingShadowCompare` (PR 9) and `transport.packagePricingLive` (PR 10–11),
  all default OFF.
- **Shadow first:** PR 9 compares old vs new pricing with no total change; diff is logged /
  returned via the shadow endpoint for review.
- **No quote total change until explicit approval** (PR 11, per piloted supplier).
- **Compare old vs new:** the shadow-compare output (route total vs package total per quote)
  is the comparison artifact; review before flipping live.
- **Rollback:** flags OFF instantly disable any new behavior. PR 6 schema fields are
  nullable/inert → no data rollback needed; reverting a PR removes its code cleanly. The old
  `excursionPackageRate`/`FULL_DAY` path stays intact until PR 11 retires it (so live pricing
  always has a working path).

## Risks
| Risk | Mitigation |
|---|---|
| Schema migration on shared Railway DB (PR 6) | Additive nullable only; proven `migrate diff` (schema-to-schema) + `migrate deploy`; NULL default = no behavior change |
| Planner mis-marks retention (PR 7) | Default Auto/unset = conservative; manual-required surfacing; never auto-count |
| Pilot contract leaks into pricing (PR 8) | No pricing path reads PACKAGE contracts until PR 9; shadow-only visibility |
| Pricing wiring changes a total (PR 9) | Shadow-compare only; totals unchanged; flag OFF; isolated PR |
| Silent cheapest selection | Recommended is a hint; planner selects; override stored |
| Source-grep `page.test.tsx` / `nest build` test compile | Known traps; run build + check baselines |

## Tests (per PR)
- **PR 6:** NULL fields → identical to today; explicit `vehicleRetained`/`transportDayType`
  honored by shadow; migration additive; `migrate status` clean; pricing untouched.
- **PR 7:** form sets fields (metadata only); no pricing change; proxy route present.
- **PR 8:** pilot contract created; shadow endpoint shows eligible/ineligible correctly; no
  pricing path references it.
- **PR 9:** route + package computed side-by-side; **stored totals unchanged**; no silent
  cheapest; comparison returned.
- **PR 10–11:** options surfaced; manual override wins; live flip per supplier; old mechanism
  retired with parity tests.

## Acceptance (PR 6, the next PR)
- 4 additive nullable fields on QuoteItineraryDay; one additive migration; `migrate status`
  clean.
- Shadow endpoint reads explicit fields (override) and falls back to inference when NULL.
- Fields NULL everywhere on deploy → no quote/pricing behavior change; `quotes.service.ts`
  untouched; no `DAILY_PACKAGE`, no pilot contracts, no overnight/stationary charging.
- Tests pass; `nest build` passes; PR limited to the listed files.

## Open decisions for you (before PR 6 implementation)
1. **Approve the additive schema change** on `QuoteItineraryDay` (4 nullable fields) — PR 6
   can't be done without it.
2. Retention fields on **QuoteItineraryDay** (recommended) vs a new **QuoteTransportDay** table.
3. Pilot supplier/vehicle for PR 8 — recommend **Alpha + Large Bus (USD)**; confirm or pick another.
