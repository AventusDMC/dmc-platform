# Booking Creation V2 — Slice 1B: Snapshot Verification + Pilot Data Readiness

**Date:** 2026-07-03
**Status:** Verification-only. No UI, no flag enablement, no schema change. `QUOTE_BOOKING_CREATE` remains OFF.
**Purpose:** Confirm the accepted-`QuoteVersion` snapshot is a complete, stable, safe source of truth for V2 booking creation **before** the Slice 1D Create-Booking UI, and record pilot supplier-data readiness.

---

## 1. Snapshot source-of-truth verification (PASS)

**How conversion sources data.** `convertToBooking` reads `QuoteVersion.snapshotJson` of the **accepted** version only (`quotes.service.ts` → `buildBookingSnapshotFromAcceptedVersion` + `buildBookingServicesFromAcceptedVersion`). The version snapshot is created as `JSON.parse(JSON.stringify(loadQuoteState(...)))` (`quotes.service.ts:6575`) — an immutable point-in-time clone. Conversion never re-reads live `quote`/`quoteItem` rows (pinned: the mapper and the snapshot builder both throw if handed a DB that is touched).

**What the accepted-version snapshot contains** (from `loadQuoteState` includes): `clientCompany`/`brandCompany`/`contact`, `quoteItems` with `service` (+`serviceType`, scalar `category`), `hotel`, `appliedVehicleRate.supplier/vehicle`, `touringRoutePricing.supplier`, `activity.supplierCompany`, **both** `itineraries` and `quoteItineraryDays` (with `dayItems.quoteService`), `pricingSlabs`, `scenarios`. So the snapshot carries everything the mapper needs for classification, supplier resolution, day mapping, and pricing.

**Booking snapshot columns populated** (verified by `quotes-booking-snapshot-verification.test.ts`):
| Column | Source |
|---|---|
| `snapshotJson` | full accepted-version snapshot (verbatim) |
| `clientSnapshotJson` | `clientCompany` (→ `company` fallback) |
| `brandSnapshotJson` | `brandCompany` → `clientCompany` → `company` → null |
| `contactSnapshotJson` | `contact` |
| `itinerarySnapshotJson` | `itineraries` array (**see observation below**) |
| `pricingSnapshotJson` | `{ pricingMode, pricingType, bookingType, totalCost, totalSell, pricePerPax, fixedPricePerPerson, validUntil, pricingSlabs, scenarios }` |

**Item-level cost preservation (PASS):** booking-service `totalCost`/`totalSell` come straight from the snapshot item values; `unitCost`/`unitSell = total ÷ qty`. No re-pricing at conversion time (pinned).

**Observation (not a defect):** `itinerarySnapshotJson` stores only the legacy `itineraries` array, **not** the V2 `quoteItineraryDays` model. That's fine — the V2 days are still in the full `snapshotJson`, and the mapper uses them to build `BookingDay`s + day links, so no booking data is lost. Documented so a future reader doesn't assume V2 days live in `itinerarySnapshotJson`.

---

## 2. External-package classification — verified on production data (GAP CONFIRMED)

**Real-data probe (read-only, 2026-07-03):** the database holds exactly **2 external-package items** (`externalPackageName` set), both neighbouring-country extension packages. **Both** are on **CONFIRMED quotes with accepted versions** (i.e., convertible via the V2 route today), and **both have NO linked `SupplierService`** (`service = null`).

**Consequence:** the mapper classifies `operationType` from `service.category` + `name` text (it builds its taxonomy with `serviceType: null`, so it **ignores** `service.serviceType.code` even when that is `EXTERNAL_PACKAGE`). With `service = null`, both real external packages classify as **`operationType = SERVICE`** (and `serviceType = 'other'`), **not** `EXTERNAL_PACKAGE`. Pinned by a real-shape fixture test.

**Severity:** **not a conversion blocker** — the rows still map with correct costs, and Ops can assign a supplier and operate them. It is a **correctness / Ops-bucketing** issue (external packages appear in the generic SERVICE lane, missing the EXTERNAL_PACKAGE treatment).

**Recommended low-risk fix (reported, NOT applied in this slice — mapper changes require sign-off):** in the mapper, classify by the existing external signal, e.g.
`const operationType = item.externalPackageName ? EXTERNAL_PACKAGE : inferBookingOperationServiceType(taxonomy)` and set `serviceType` accordingly. This mirrors the `externalPackageName` signal already used by the preview/apply gates and is contained to the conversion path.

---

## 3. Pilot supplier-data readiness checklist

Unresolved suppliers are **not** a conversion blocker — a booking still converts; the service row simply arrives `assignmentStatus = UNASSIGNED` → Ops **"Needs Assignment"**. To avoid a wall of unassigned rows on the first pilot booking, confirm the following for each pilot quote **before** enabling `QUOTE_BOOKING_CREATE`:

- [ ] **Supplier exists:** every priced quote item's `supplierId` resolves to a row in the `Supplier` table. (If it doesn't, the id is dropped to `null` at conversion; the quote's supplier *name* is retained for context, but the row is unassigned.)
- [ ] **Correct service type:** each item's `service.category` maps to the intended operational bucket — TRANSPORT / HOTEL / GUIDE / ACTIVITY / DINING / TICKET / EXTERNAL_PACKAGE / SERVICE. (Meals now → DINING; guides preserve timing — Slice 1C-Hardening.)
- [ ] **External packages:** if the pilot includes external packages, expect them in the SERVICE lane until the §2 fix lands — or hold external-package pilots until then.
- [ ] **Supplier operational contact/email valid:** each pilot supplier has a valid operational email on file (needed later for supplier confirmation / voucher — **not** exercised by conversion, and the send allowlist is unchanged).
- [ ] **Accepted version present:** the pilot quote is `ACCEPTED`/`CONFIRMED` with a populated `acceptedVersionId` (the conversion precondition).

**Framing:** items above are **data-readiness** tasks, not code blockers. Conversion is safe to run against imperfect supplier data; the cost is manual Ops assignment afterward.

---

## 4. Remaining blockers before Slice 1D (Create-Booking UI)

- **None that block conversion.** Snapshot sourcing, pricing preservation, and day mapping are verified correct.
- **Decision needed (not blocking):** whether to apply the §2 external-package low-risk fix before the UI, or accept external → SERVICE for the first pilot (recommended only if the pilot excludes external packages).
- **Operational readiness (not blocking):** run the §3 checklist against the specific pilot quote(s) so the first converted booking isn't dominated by "Needs Assignment" rows.

---

## Tests added
- `apps/api/src/quotes/quotes-booking-snapshot-verification.test.ts` (8/8): six snapshot columns, pricing snapshot, pax/room/night coercion, brand/client/contact fallbacks, builder purity, item-cost preservation, the `itinerarySnapshotJson` observation, and the real-shape external-package fixture.
