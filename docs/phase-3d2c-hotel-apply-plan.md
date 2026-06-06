# Phase 3D.2C — Optional apply of operator-confirmed hotel suggestions (PLAN)

Status: approved in direction (2026-06-06). Implemented in two reviewed PRs:
**3D.2C-A** (pure model + apply-plan, no writes) → **3D.2C-B** (UI confirmation +
apply runner hotel POST + live E2E).

## Goal
When the operator **explicitly confirms** a suggested hotel in the touring-route
generator preview (3D.2B), the Apply step creates a hotel quote item using the
**existing** hotel item creation/pricing path (`POST /quotes/:id/items` →
`QuotesService.createItem` → `HotelPricingResolver` → `QuotePricingService`).
No hotel engine, resolver, BB/HB, or pricing-service changes.

## Principles (guardrails)
- No hotel item unless the operator **explicitly confirms** it (opt-in; default off).
- Skip / add-later → no hotel item.
- Missing hotel / contract / rate (`missingReason`) → no hotel item.
- Empty-quote-only rule remains; no append/replace; no delete/overwrite.
- Hotel engine, `HotelPricingResolver`, BB/HB supplement logic, `QuotePricingService` — **untouched**.
- No manual override for hotels; no auto-created activities/entrances/meals/guides/rooming/vouchers/supplier confirmations.

## 1. Existing hotel apply payload (audited)
Auto Itinerary Builder, `QuoteAutoItineraryBuilder.tsx` (`POST ${apiBaseUrl}/quotes/{id}/items`):
```
serviceId, itineraryId (check-in dayId), quantity (=roomCount), paxCount,
roomCount, nightCount, markupPercent: 20, hotelId, contractId, seasonName,
roomCategoryId, occupancyType, mealPlan
```
No `serviceDate`/`startTime` for hotels (season resolved server-side from `seasonName`).
`roomCount = quote.roomCount || ceil(pax/2)`. Idempotency key `${dayId}|${hotelId}`.

## 2. Reuse strategy (no engine change)
Reuse the payload verbatim and POST to the same endpoint the panel already uses for
transport. The request flows through the **unchanged** createItem → HotelPricingResolver
→ QuotePricingService. New code is **frontend-only**: carry hotel IDs through the
suggestion model, a confirm control, emit confirmed-hotel items in the pure apply plan,
one POST loop in the apply runner, and two new props (`hotelServiceId`, `defaultRoomCount`).

## 3. Confirmed-suggestion model
`OvernightHotelSuggestion` (3D.2B) carried only display fields. 3D.2C-A adds the apply
IDs passed through from `findHotelSetup`: `hotelId`, `contractId`, `roomCategoryId`,
`occupancyType`, `seasonName` (`mealPlan` already present). Null whenever there is no
match (disabled / no city / `missingReason`).

## 4. Apply behavior
`applyGenerated` keeps its order, plus one new step:
1. Pre-flight empty-quote re-check (`dayCount>0 → abort`).
2. Create itinerary days (`dayIdByNumber`).
3. Create ONE touring-route transport package on day 1.
4. Create POI assignments per day.
5. **NEW:** for each **confirmed** hotel suggestion → `POST /quotes/{id}/items` with the
   §1 payload, `itineraryId = dayIdByNumber.get(night.nightNumber)`. Unconfirmed /
   skipped / `missingReason` / unmatched → no item.

Confirmed-hotel items are produced by the **pure** `buildTouringRouteApplyPlan`, extended
to return `hotels: ApplyPlanHotel[]` (testable, no I/O); the runner just iterates it.
UX: a per-night "Add this hotel to the quote" checkbox (default **off**), disabled when
the suggestion has `missingReason` or is skipped.

## 5. Consecutive-night grouping — DEFERRED (v1)
One hotel item per confirmed overnight night. The Auto Builder's grouping logic is inline
(not a reusable helper), and the current touring routes have one overnight night each, so
grouping is a no-op for real cases. Extracting/reusing grouping is a possible later 3D.2C.1.

## 6. Safety
No item when: skipped (`disabled`), `missingReason` set, any required id missing/empty
city, not confirmed (default), or the empty-quote gate blocks apply (`canApply=false`).
Step 5 is create-only (no delete/overwrite/append); idempotency key `${dayId}|${hotelId}`.
Pricing is computed server-side by the unchanged engine; the frontend only sets `markupPercent: 20`.

## 7. Tests
**Pure (tsx --test):**
- `buildOvernightHotelSuggestions` passes through the apply IDs.
- `buildTouringRouteApplyPlan`:
  - Amman→Dana→Petra, Petra Moon confirmed → exactly one `ApplyPlanHotel` with correct
    hotelId/contractId/roomCategoryId/occupancyType/seasonName/mealPlan, `attachToDayNumber=1`, `nightCount=1`, correct pax/room.
  - Skip/add-later → `hotels=[]`.
  - `missingReason` → `hotels=[]`.
  - Unconfirmed → `hotels=[]`.
  - Ajloun & Jerash (1 day → 0 nights) → `hotels=[]`.
  - No hotel service wired / blocked quote → `hotels=[]`.
  - Transport still exactly one; days + POI assignments unchanged.

**Live E2E (3D.2C-B, prod-after-merge):** confirm Petra Moon → exactly one hotel item;
pricing total includes the hotel via the existing path; BB/HB unchanged; proposal
Accommodation shows the hotel; no hotel-pricing-engine change.

## 8. Out of scope
hotel engine redesign · hotel imports · rooming · vouchers · supplier confirmations ·
activities · entrances · meals · append/replace · TouringRouteDay · PR #321 ·
manual override UI · machine translation · ZZ cleanup.

## PR split
- **3D.2C-A** (this PR): extend `OvernightHotelSuggestion` with apply IDs; add
  `ApplyPlanHotel` + `hotels[]` to `buildTouringRouteApplyPlan` (confirmed + valid only);
  pure tests. No UI, no POST, no writes.
- **3D.2C-B** (separate, after approval): confirmation checkbox; `hotelServiceId` /
  `defaultRoomCount` prop wiring; apply-runner hotel POST step; live E2E.
