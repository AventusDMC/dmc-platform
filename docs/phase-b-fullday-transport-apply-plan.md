# Phase B — PackageTemplate routeless FULL_DAY transport apply mapping (PLAN)

Status: approved in direction (2026-06-06). **Documentation only.** Implementation
lands as a separate PR after this doc is merged and reviewed.

## Objective
Let `applyPackageTemplateToQuote` price **FULL_DAY / daily-disposal** transport
components through the **existing** `VehicleRate` matching, **without requiring a
`routeId`**. No transport-engine, pricing-formula, schema, `VehicleRate`,
`QuotePricingService`, or route changes.

## Background (confirmed by live read-only audit)
- Daily-FD service type `5769d0b7…` = "Daily Full Day", code `DAILY_FULL_DAY`,
  **classification `FULL_DAY`**.
- **12 active** `VehicleRate` rows exist for it, valid 2026-04-01 → 2026-12-31.
  For 2 pax the cheapest fitting rate is **Sedan 2 @ 75 JOD** (supplier Almushtari).
- The transport engine already supports routeless matching: `VehicleRate.routeId`
  is optional, and `findMatchingRate` keys on `serviceTypeId` + pax + date with
  `routeId` optional.
- The **only** blocker is the PackageTemplate apply mapping, which hard-requires a
  `routeId` for non-touring transport.

## 1. Current failure path
`resolvePackageTransportMapping` (`apps/api/src/quotes/quotes.service.ts:4583`):
- `if (component.touringRouteId)` → touring-route pricing branch.
- else (`:4658-4661`): resolves `transportServiceType`, then
  `if (!component.routeId || !transportServiceType?.id) return null;` and calls
  `findMatchingRate({ serviceTypeId, routeId, paxCount })` (`:4670`).

A FULL_DAY component (serviceType set, **no `routeId`**, no `touringRouteId`) hits
the else branch, fails `!component.routeId`, returns `null` → treated as a skip by
`getPackageComponentMappingStatus` (`:4190-4194`) and
`buildPackageComponentQuoteItemPayload` (`:4804-4814`). The `routeId` requirement
is the sole cause.

## 2. New branch
Insert a third branch in `resolvePackageTransportMapping`, after resolving
`transportServiceType` and **before** the `!component.routeId` gate:
- Trigger when: `!component.routeId` AND `transportServiceType?.id` AND
  `transportServiceType.classification ∈ { FULL_DAY, HALF_DAY, DAILY_PACKAGE }`.
- Resolve the transport supplier service (component.supplierService or the
  existing TRANSPORT fallback); require `isTransportService`.
- Call the **existing** `transportPricingService.findMatchingRate({
  serviceTypeId: transportServiceType.id, paxCount, travelDate /* if available */ })`
  with **no `routeId`**.
- If no rate → `return null` (clean, FULL_DAY-specific skip reason).
- Else return a mapping with `serviceId`, `transportServiceTypeId`,
  `vehicleRateId`, `currency`, `dayCount: 1`, plus display fields
  (serviceName/serviceTypeName/vehicleName/pricingMode/rateStatus) — **no
  `routeId`, no `touringRouteId`, no `overrideCost`**.

Detection uses the engine's `classification` (robust), not the free-text
`pricingMode` label. Point-to-point (ROUTE_TRANSFER / unclassified) continues to
fall through to the unchanged `routeId` branch.

## 3. Payload shape
`buildPackageComponentQuoteItemPayload` (`:4804-4814`) already merges
`{ ...common, ...transportMapping }`. `common` (`:4779-4788`) supplies
`quoteId`, `packageTemplateId/DayId/ComponentId` (provenance), `itineraryId`
(day linkage), `quantity:1`, `paxCount`, `markupPercent:0`. The new mapping adds
`serviceId`, `transportServiceTypeId`, `vehicleRateId`, `currency`, `dayCount:1`,
display fields — **no `routeId`/`overrideCost`**. `createItem` prices the item
from `vehicleRateId` via the engine.

Implementation-verification point: confirm `createItem`'s transport path resolves
a `vehicleRateId` without a `routeId` (the engine accepts `vehicleRateId`
directly; verify when coding, do not assume).

## 4. Apply behavior (Jordan Explorer 8 Days)
Days 2,3,4,5 "Daily FD" each resolve the cheapest fitting full-day rate
(Sedan 2 @ 75 JOD for 2 pax) → **one full-day transport item per day** (4 new
items), day-linked, provenance-stamped. No grouping this phase. No route created.
D1 QAIA→Amman unchanged. D8 Dead Sea→QAIA remains separate data-link work.

## 5. Pricing behavior
Rate stays in the `VehicleRate` currency (JOD); existing FX conversion to the
quote currency handled by the unchanged pricing path. `markupPercent:0` unchanged
(markup policy out of scope). No pricing formula change.

## 6. Tests required
- Routeless FULL_DAY component → mapping returns a `vehicleRateId`, no `routeId`.
- `findMatchingRate` called with `serviceTypeId` + `paxCount` and **no `routeId`**.
- 2 pax selects the expected Sedan 2 / cheapest fitting rate.
- Point-to-point route transfer still requires and uses `routeId`.
- TouringRoute transport branch unchanged.
- No active FULL_DAY rate → clear skip reason.
- PackageTemplate provenance still stamped.
- Jordan Explorer Days 2–5 would create 4 full-day transport items.
- No transport-engine/formula files changed.

## 7. Safety / guardrails
No data writes · no schema change · no `VehicleRate` change · no transport-engine
change · no `QuotePricingService` change · no `HotelPricingResolver` change ·
no guide / markup / activity-variant / ticket-rate / Day-7-hotel / package-data
changes. Change surface ≈ one function (+ skip-reason text) + tests.

## 8. Live verification (post-merge, throwaway quote)
Apply Jordan Explorer 8 Days to a fresh throwaway quote and confirm: Days 2–5 each
create a full-day transport item from an existing FULL_DAY `VehicleRate`; D1 still
works; D8 remains separate/skipped; quote total increases by the four daily
transport items; no pricing regression on previously-created items.

## 9. Transport day classification + stationary/local handling (added)
Read-only audit of the transport taxonomy (13 `TransportServiceType` rows):
- **ADD_ON**: `STATIONARY_WAITING`, `PETRA_OVERNIGHT`, `WADI_RUM_OVERNIGHT`,
  `DEAD_SEA_OVERNIGHT`, `AQABA_OVERNIGHT`, `EXTRA_KM`, `EXTRA_HOUR`.
- **ROUTE_TRANSFER**: `POINT_TO_POINT`, `AIRPORT_TRANSFER`, `BORDER_TRANSFER`, `PRIVATE_TRANSFER`.
- **FULL_DAY**: `DAILY_FULL_DAY`. **HALF_DAY**: `HALF_DAY`.

**Stationary/waiting exists ONLY as `ADD_ON`** (service type `STATIONARY_WAITING`
+ vehicle-rate add-ons `STATIONARY`/`WAITING`/`OVERNIGHT`/`EXTRA_KM`/`EXTRA_HOUR`).
There is **no standalone "stationary/local full-day" base classification**.

Per-day classification model (A–E):
- **A point-to-point transfer** → `ROUTE_TRANSFER` (needs route; unchanged branch).
- **B touring route / moving touring day** → `touringRouteId` (unchanged branch).
- **C full-day daily disposal / moving touring day** → base `FULL_DAY`/`HALF_DAY`
  (e.g. `DAILY_FULL_DAY`) — **this is what Phase B prices, by the component's OWN
  serviceType.**
- **D stationary / local disposal / waiting day** → modeled as an **`ADD_ON`**
  (e.g. `STATIONARY_WAITING`) layered on a base engagement, or a cheaper local
  base rate. **NOT a standalone base full-day.**
- **E unknown / insufficient data**.

**Phase B rule (clarified):** the new branch triggers on the resolved service
type's classification ∈ `{FULL_DAY, HALF_DAY, DAILY_PACKAGE}` and prices via the
component's **own** `transportServiceTypeId` (and the matched `VehicleRate`). It
**must NOT** auto-substitute `DAILY_FULL_DAY`, and **must NOT** auto-classify a day
as stationary vs moving — the template author's chosen serviceType is authoritative.

**Jordan Explorer 8 Days — confirmed classification:**
- D1 QAIA→Amman = **A** (AIRPORT_TRANSFER, route-priced) — works.
- D2 Amman/Jerash, D3 Madaba/Nebo/Dead Sea, D4 Petra/Wadi Rum, D5 Wadi Rum/Dead
  Sea = **C** — all `DAILY_FULL_DAY`, genuinely **moving** full-day touring days
  (Phase B prices these).
- D6/D7 Dead Sea = leisure, **no transport component** (no stationary component).
- D8 Dead Sea→QAIA = **A** (separate route-link data item).
→ **All 4 "Daily FD" components in Jordan Explorer are moving full-day (C), none is
stationary (D).** So Phase B fully covers this template's transport.

**Documented gap (data/model — do NOT fake):** a true **stationary/local-standby
day** (e.g. a 2-night Petra stay where Day-N is hotel↔site↔hotel) cannot be priced
as a standalone PackageTemplate transport component today, because stationary is an
`ADD_ON` and PackageTemplate apply has **no transport add-on layering**. Options
for a **future, separate** phase (NOT Phase B): (a) add transport add-on support to
package apply (STATIONARY_WAITING / overnight / extra-km), or (b) let the supplier
provide a cheaper local base `HALF_DAY`/`FULL_DAY` rate the operator links. Phase B
neither solves nor fakes this; it simply prices base FULL_DAY/HALF_DAY components by
their own serviceType.

## Out of scope
guide fields · markup policy · activity variant · D8 route link · Day-7 hotel ·
hotel grouping · append/replace · rooming · vouchers · supplier confirmations ·
**transport stationary/waiting/overnight ADD-ON layering (separate future phase)** ·
PR #321 · TouringRouteDay · manual override UI · machine translation · ZZ cleanup.
