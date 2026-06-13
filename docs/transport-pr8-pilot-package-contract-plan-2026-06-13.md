# PR 8 — Pilot PACKAGE_MIN_FULL_DAY Contract (PLAN ONLY)

**Date:** 2026-06-13
**Status:** PLAN ONLY — no code/data/DB write. For approval.
**Goal:** Create **one** pilot `PACKAGE_MIN_FULL_DAY` contract for **shadow validation only**.
**No live package pricing activation.** (Probed values below are from the live DB.)

## 1. Pilot supplier / vehicle (confirmed from live data)
- **Supplier:** `Alpha Bus and Limo Co` — `id = 3f63311b-021f-432a-8ff8-fc5d5f407ad0`
  (transportDiscountPercent 25).
- **vehicleClass:** `Large Bus` · **currency:** `USD`.
- **Existing ROUTE_TRANSFER context (unchanged by PR 8):**
  - Alpha · Large Bus · **USD** ROUTE_TRANSFER contract `2efde04a-bdc7-4b94-a305-1d042d2e42ee`
    (validity 2026-04-01…2026-12-31, active) — the priced one.
  - Alpha · Large Bus · JOD ROUTE_TRANSFER `04d23bd7-…` (touring-only). The pilot PACKAGE
    contract is a **separate regime row**; it does not touch either ROUTE contract.
- **Priced Large Bus vehicles:** `Large VIP 31-33` (123 rate rows), `Large 49` (123 rows).
- **0-rate duplicates (NOT involved):** `Mercedes Grand Star 31 Pax`, `Mercedes Grand Star 49 Pax`
  (0 rows). The pilot contract is **class-level** (not vehicle-level), so duplicates can't be
  double-counted.

## 2. Proposed pilot contract field values
| Field | Value | Source / note |
|---|---|---|
| `supplierId` | `3f63311b-021f-432a-8ff8-fc5d5f407ad0` | Alpha |
| `vehicleClass` | `Large Bus` | |
| `currency` | `USD` | |
| `regime` | `PACKAGE_MIN_FULL_DAY` | |
| `minimumFullDays` | `3` | |
| `minimumDayPolicy` | `INELIGIBLE_UNDER_MIN` | safest default for a pilot |
| `fullDayRate` | `656` | Alpha `Large 49` DAILY_FULL_DAY USD (class also has `Large VIP 31-33` @ **930** — see Risk) |
| `halfDayRate` | `370` | Alpha `Large 49` HALF_DAY USD (`Large VIP 31-33` @ 585) |
| `airportTransferIncluded` | `false` | default |
| `halfDayCountsTowardMin` | `false` | default (half-day never auto-counts) |
| `halfDayChargedAsFullDay` | `false` | default |
| `halfDayIncludedInPackage` | `false` | default |
| `packageDayWeight` | `0.5` | default (inert while halfDayCountsTowardMin=false) |
| `driverOvernightPolicy` | `SEPARATE` | **inert in PR 8** (no overnight charging) |
| `driverOvernightAmount` | `null` | |
| `stationaryChargedSeparately` | `true` | default, inert |
| `stationaryIncludedInPackage` | `false` | default, inert |
| `stationaryCountsTowardMinDays` | `false` | default, inert |
| `driverOvernightOnStationary` | `true` | default, inert |
| `baseCityOverride` | `null` | Alpha base = Amman (default) |
| `validFrom` / `validTo` | `2026-04-01` / `2026-12-31` | mirror the ROUTE USD contract window |
| `active` | `true` | **required** for the shadow endpoint to find it; no live pricing reads PACKAGE contracts |
| `notes` | `"PILOT — shadow validation only; not wired to live pricing"` | |

## 3. Data creation method — recommended: idempotent one-off script
- **Recommended:** a small **idempotent script** (e.g. `scripts/create-pilot-package-contract.cjs`)
  that does `findFirst({supplierId, vehicleClass, regime, currency})` → `create` only if
  missing. Reviewable, re-runnable, reversible. Run via the production-safe path against
  Railway (single insert), like the PR 2 backfill.
- **Rejected:** migration-seed (keeps data out of migrations); manual DB insert (not
  reviewable/idempotent); admin creation (no TransportContract admin UI exists yet).

## 4. Shadow validation
- The existing shadow endpoint `GET /transport-pricing/quotes/:id/package-eligibility-shadow`
  finds the contract via `findFirst({ supplierId, vehicleClass, regime: 'PACKAGE_MIN_FULL_DAY',
  active: true })` for the quote's **primary** supplier+vehicleClass. With the pilot created,
  a quote whose transport days resolve to **Alpha + Large Bus** will surface it.
- **Eligible case:** a test quote with **3 days**, each marked (via the PR 7 UI metadata)
  `vehicleRetained = true` (or touring/full-day), Alpha Large Bus vehicle → shadow returns
  `contract.found=true`, `countedFullPackageDays=3`, `eligible=true`.
- **Below-minimum:** **2 days** → `eligible=false`, `reason='below-minimum'` (default policy).
- **Live pricing unchanged:** the quote's normal computed total is unaffected (shadow is
  read-only and wired into nothing); verified by grep that no pricing path queries
  `PACKAGE_MIN_FULL_DAY`.

## 5. Safety
- No quote total changes; no live pricing path reads PACKAGE contracts (only the shadow
  endpoint does). No `DAILY_PACKAGE` activation, no `minimumFullDays` enforcement in live
  pricing, no overnight/stationary charging, no automatic cheapest selection, no quote-builder
  package-option UI. `active=true` only makes the contract visible to the **shadow**.

## 6. Tests & acceptance
- **Pilot contract exists:** a query confirms exactly one Alpha · Large Bus · USD ·
  PACKAGE_MIN_FULL_DAY row with the values above (script is idempotent — re-run creates 0).
- **Shadow finds it:** shadow endpoint on an Alpha/Large-Bus test quote → `contract.found=true`.
- **3 retained days → eligible in shadow only** (no total change).
- **2 days → ineligible** (`below-minimum`) under `INELIGIBLE_UNDER_MIN`; eligible only if a
  later contract uses `CHARGE_MINIMUM_DAYS`.
- **Route/transfer pricing unchanged** + **quote totals unchanged** (compute a representative
  Alpha quote before/after pilot creation → identical).
- **No live pricing behavior changed** (grep: no pricing code references PACKAGE regime).
- Unit coverage already exists (PR 4–6 shadow/evaluator tests with a PACKAGE contract); PR 8
  adds a verification doc capturing the live shadow output + the before/after total check.

## 7. Rollback
- **Soft disable (sufficient):** set `active = false` → the shadow's `findFirst(active:true)`
  no longer matches → reverts to `no-package-contract`. No other effect (no rate rows are
  attached to the pilot PACKAGE contract; ROUTE contracts are untouched).
- **Hard rollback:** delete the row (clean — nothing references it; rate rows live on the
  ROUTE_TRANSFER contracts). The idempotent script can be re-run to recreate.

## File list (when implemented)
| File | Type |
|---|---|
| `scripts/create-pilot-package-contract.cjs` | new (idempotent create) |
| `docs/transport-pr8-pilot-package-contract-plan-2026-06-13.md` (this) + verification doc | docs |
*(No app/schema/migration/pricing code. No admin UI.)*

## Risks
| Risk | Mitigation |
|---|---|
| Pilot contract read by live pricing | Verify no pricing path queries PACKAGE regime; only the shadow does; `active` gates shadow only |
| `fullDayRate` per-class simplification (Large 49 = 656 vs Large VIP 31-33 = 930) | Pilot uses 656; flag that real package pricing (PR 9) may need per-vehicle rates within a class — a pricing-design decision, irrelevant to PR 8 eligibility |
| Writing to shared Railway DB | Idempotent single-row script; reversible via active=false/delete |
| `active=true` looks "live" | No live pricing path reads PACKAGE contracts; documented |

## Open decisions for you
1. Confirm **Alpha · Large Bus · USD** as the pilot (recommended).
2. Confirm `minimumDayPolicy = INELIGIBLE_UNDER_MIN` and `fullDayRate = 656` / `halfDayRate = 370`
   (or pick the `Large VIP 31-33` rates 930/585, or note the class needs per-vehicle rates).
3. Confirm **idempotent script** as the creation method.
