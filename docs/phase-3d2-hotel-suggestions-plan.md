# Phase 3D.2 — Hotel Suggestions for the Touring-Route Generator (Plan)

**Status:** Approved in direction (2026-06-06). Planning document only — no code.

**Principle:** reuse the existing hotel matcher and the existing hotel-item
pricing path **unchanged**. Suggestions only; the operator confirms before
apply; empty-quote-only; **no hotel item unless explicitly selected**.

## Guardrails (apply to every sub-phase)

- Hotel suggestions are **suggestions only**. No hotel item is created unless
  the operator explicitly confirms it in the preview.
- The existing hotel engine is **untouched**: `HotelPricingResolver`, hotel
  contract logic, hotel rate logic, BB/HB supplement logic, the quote pricing
  engine, rooming, vouchers, supplier confirmations, hotel imports.
- Overnight-city logic is **conservative**: for Amman → Dana → Petra ON, the
  suggested hotel city is **Petra / Wadi Musa**, not Dana. The operator can edit
  the overnight city in the preview. If the heuristic is uncertain, **show
  ambiguity rather than hide it**.
- **One-day routes suggest no hotel** (e.g. Ajloun & Jerash → zero overnights).
- Empty-quote-only stays; no append/replace; no deletion; no overwrite.

## 1. Existing hotel-matcher audit

- **Where:** `findHotelSetup(...)` —
  `apps/admin-web/app/quotes/[id]/QuoteAutoItineraryBuilder.tsx:642–733`. Pure,
  deterministic.
- **Inputs:** `{ city, travelDate, hotels[], hotelContracts[], hotelRates[],
  optimizationMode('cost'|'comfort') }`. Needs only a **city string** + the
  three catalogs (already loaded on the quote page) + an optional date (filters
  contract validity).
- **Works from a generated base/overnight city?** Yes — city string alone.
- **Returns:** `{ hotel, contract, rate, missingReason }` where `rate` carries
  `seasonName, roomCategoryId, occupancyType (SGL/DBL/TPL), mealPlan (BB/HB/FB),
  cost`. Sell is computed later by the pricing engine when the item is created
  (the matcher does not compute sell).
- **Reusable without modification?** Yes. 3D.2A lifts it into the shared
  `…logic.ts` byte-for-byte (no logic change).

## 2. Generator integration & the overnight-city decision (the crux)

- The preview already exposes per-day `baseCity` + `date`
  (`TouringRoutePreviewDay`, `…logic.ts:565`).
- **Which nights get a hotel:** overnights = `durationDays − 1` for a round
  trip (no sleep on the final return day). Compute a **per-night overnight
  city**, not "one hotel per day".
- **Petra vs Dana (and the old "Petra Moon location = Dana" bug):**
  `deriveTouringRouteBaseCities` for *Amman → Dana → Petra → Amman* (durationDays
  2) yields `["Amman","Dana"]` with `ambiguous=true`, but the real overnight is
  **Petra** (end-of-day location). Recommendation: derive the overnight city as
  the **last visited POI city of that day**, fall back to `baseCity`, surface it
  as an **editable** field, and **carry the ambiguity flag**. The proposal
  already renders accommodation location + overnight badge from `item.hotel?.city`
  (Phase 3D.1L/3D.1O), so once the operator picks a Petra hotel the bug cannot
  recur.

## 3. Preview behavior (suggestions only)

- Each overnight shows a suggested hotel (name, room, board, est. cost) with the
  resolved city, OR **"No suitable hotel found"** + `missingReason`
  (no-hotel-in-city / no-valid-contract / no-rate).
- Operator can change the overnight city, remove a suggestion, or leave it
  unselected. No hidden/auto hotel creation.

## 4. Apply behavior (safest)

- Apply still does exactly what 3D.1 does (days → one transport package → POI
  assignments) and **additionally**, only for nights the operator **explicitly
  confirmed**, creates a hotel item using the existing Auto-Builder payload
  (`serviceId, itineraryId, hotelId, contractId, seasonName, roomCategoryId,
  occupancyType, mealPlan, nightCount, paxCount, roomCount, markupPercent`) with
  consecutive-night grouping. Unconfirmed/no-match nights create no item.

## 5. Data safety

- Empty-quote-only gate stays (`buildTouringRouteApplyPlan` blocks if any
  day/POI exists, with apply-time re-check). No append/replace, no deletion, no
  overwrite. No hotel item unless operator-selected.

## 6. Pricing safety

- Confirmed hotel items go through the **normal** path
  (`createItem → resolveQuoteItemValues → HotelPricingResolver →
  calculateMultiCurrencyQuoteItemPricing`, `quotes.service.ts:5484–5613`). **No
  `overrideCost`/`useOverride` for hotels** (override is only the touring
  transport package's existing approved flow). `HotelPricingResolver` and
  `QuotePricingService` are not touched. BB/HB and supplements remain entirely
  in the resolver.

## 7. Test scenarios

Amman→Dana→Petra ON → Petra hotel suggested (overnight = Petra, not Dana) ·
Petra→Wadi Rum ON → Wadi Rum camp if available · Ajloun & Jerash 1-day → no
hotel · no-match route → "No suitable hotel found" · operator removes → no item
· operator confirms → exactly one engine-priced hotel item · proposal renders
the stay with hotel city · totals correct.

## 8. Out of scope

hotel engine redesign, hotel import, rooming, vouchers, supplier confirmations,
activities, entrances, meals, append/replace, TouringRouteDay, PR #321, manual
override UI, machine translation, ZZ cleanup.

## Recommended phase split

- **3D.2A — matcher audit + helper only (no UI):** export `findHotelSetup` into
  the shared `…logic.ts` (byte-identical) + a pure `deriveOvernightNights`
  helper (overnight city + nights per night, with ambiguity flags). Unit tests
  only. No preview/apply changes, no writes, no hotel-item creation, no pricing
  changes.
- **3D.2B — preview UI only (no writes):** render per-night hotel suggestions in
  `GenerateFromTouringRoutePanel` (thread the hotels/contracts/rates catalogs
  in), with editable overnight city, remove, and "No suitable hotel found".
  Local React state only; apply unchanged (still no hotel items).
- **3D.2C — optional apply of operator-confirmed hotels:** extend the apply
  runner to create hotel items only for confirmed nights, reusing the existing
  payload + consecutive-night grouping + engine pricing. Empty-quote gate
  intact. Live-verify on a fresh empty quote.

### 3D.2A test checklist

- `findHotelSetup` output unchanged after the lift-and-shift.
- Ajloun & Jerash 1-day route → zero hotel nights.
- Amman → Dana → Petra ON → one overnight night, suggested city Petra / Wadi
  Musa (or Petra).
- Petra → Wadi Rum ON → one overnight night, suggested city Wadi Rum (if
  supported by route data).
- no-match / uncertain route → returns an ambiguity flag.
- base / null-POI stops do not create hotel nights by themselves.
