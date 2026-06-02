# Transport Service-Type Consolidation — Scope

_Status: scoped, not started (Phase 1 dry-run complete). Last updated 2026-06-02._

## Problem

There are **24** `TransportServiceType` rows. **8 are completely dead** (zero references)
and several more are near-duplicates that accumulated from multiple imports (Alpha fleet,
contract imports, seeds). This causes real bugs: package components were pointed at an empty
`Full Day` type while the live rates sat under `Daily Full Day`, so those lines silently failed
to price. (That specific case is already fixed — 16 components repointed — but the underlying
taxonomy mess remains.)

## Inventory (dev DB, 2026-06-02)

Reference columns counted: `VehicleRate.serviceTypeId`, `TransportPricingRule.transportServiceTypeId`,
`TouringRoutePricing.transportServiceTypeId`, `QuoteItem.transportServiceTypeId`,
`PackageTemplateComponent.transportServiceTypeId`, `ExcursionTemplateComponent.transportServiceTypeId`.

### Canonical — keep (~10)

| Type | code | Evidence |
|---|---|---|
| Point-to-Point | POINT_TO_POINT | 380 rates, 368 rules, 31 quote items — intercity workhorse |
| Private Transfer | PRIVATE_TRANSFER | 240 rates, 240 rules, 12 excursion components |
| Daily Full Day | DAILY_FULL_DAY | 12 rates, 90 touring, 30 quotes, 16 package (incl. the Daily FD repoint) |
| Airport Transfer | AIRPORT_TRANSFER | 32 rates/rules, 5 quotes |
| Border Transfer | BORDER_TRANSFER | 16 rates/rules |
| Half Day | HALF_DAY | 12 rates, 4 quotes, 4 package |
| Stationary / Waiting | STATIONARY_WAITING | 12 rates, 3 quotes |
| Aqaba / Dead Sea / Petra / Wadi Rum Overnight | *_OVERNIGHT | 5 rates each — real surcharges |

### Merge sources → targets (low ref counts to repoint)

| Source (refs) | → Target | Notes |
|---|---|---|
| `Full Day` (4 quoteItems, 1 excursion, 1 inactive rule) | `Daily Full Day` | package components already repointed |
| `Private Transfer Service` (1 rate, 1 rule) | `Private Transfer` | near-identical |
| `Arrival Transfer` (4 package) | `Airport Transfer` | arrival == airport |
| `Stationary` (8 rules, 0 rates) | `Stationary / Waiting` | rules here, rates on the other |
| `Day Tour` (2 excursion) | `Half Day` **or** `Daily Full Day` | **semantic — needs ops decision** |

### Dead — remove (zero references)

8 types had zero refs, but **2 are core seeded add-ons** (`Extra Hour`, `Extra KM`) that
`TransportServiceTypesService.ensureCorePricingModeServiceTypes()` re-creates on demand — so
they're intentionally available (just unused) and must be kept. That leaves **6 truly removable**:
`Departure Transfer` (DEP), `Excursion Transfer` (EXC), `Intercity Transfer` (INT),
`Per Hour` (PER_HOUR), `Transfer` (TRANSFER), `Transport Add-on / Daily Charge` (TRANSPORT_ADD_ON_DAILY_CHARGE).

> **✅ Phase 1 DONE (2026-06-02).** `TransportServiceType` had no soft-delete column, so we added
> `isActive Boolean @default(true)` (migration `add_transport_service_type_is_active`), soft-deactivated
> the 6, and filtered `transport-service-types` `findAll` to `isActive: true` so they drop out of
> pickers. Reversible (set `isActive` back to true). 18 active / 6 inactive.

## Migration mechanics (per merge)

1. **Dry-run** the source→target repoint; record before-state (`id → old serviceType`) for rollback.
2. Repoint all 6 reference columns from source to target.
3. **Dedupe**: merging can create duplicate `VehicleRate` / `TransportPricingRule` rows for the
   same `(route, vehicle, pax band)`. Detect and drop/merge duplicates before/after repoint.
4. Remove (per the chosen removal method) the now-orphaned source type.
5. Verify: zero remaining refs to source; transport resolution unchanged-or-better; existing quote
   totals unchanged.

## Risks

1. **Unique constraints / duplicate rates** — a blind repoint can collide; needs a dedupe step.
2. **Historical quote items** — repointing `QuoteItem.transportServiceTypeId` changes the *displayed*
   service type on past quotes. Stored costs (`totalCost`, etc.) are unaffected, but it touches
   finance-facing records → **ops sign-off required**.
3. **`classification` consistency** — each type carries a `TransportServiceClassification`; merges
   must preserve it (don't merge a `ROUTE_TRANSFER` into a `DAILY` type, etc.).
4. **Semantic calls** — Day Tour / Excursion Transfer / arrival-vs-departure are judgment, not mechanical.

## Phasing & effort

| Phase | Scope | Effort | Risk |
|---|---|---|---|
| 1 | ✅ DONE — soft-deactivated the 6 removable dead types (kept Extra Hour/Extra KM core add-ons) via new `isActive` column | — | low (zero refs) |
| 2 | Mechanical merges (Full Day, Private Transfer Service, Arrival/Departure→Airport, Stationary) via one reusable repoint+dedupe script, dry-run each | 1–2 days | medium (touches quote items → ops sign-off) |
| 3 | Semantic merges (Day Tour, Excursion Transfer); finalize canonical list | depends on ops | medium |
| 4 | **Import guard** — normalize service-type on the import paths that created these duplicates so it doesn't recur | ½–1 day | low — this is what makes it stick |

## Decisions needed from ops before Phase 2/3

1. Confirm the ~10 canonical types to keep.
2. `Day Tour` → Half Day or Daily Full Day?
3. Removal method for dead/merged types: hard-delete vs add `isActive` soft-delete vs rename-prefix.
4. Sign-off that repointing `QuoteItem.transportServiceTypeId` on historical quotes is acceptable
   (no price change — label only).
