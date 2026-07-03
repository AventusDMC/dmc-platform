# Booking Creation V2 — Slice 1E: Finance Read-only Snapshot / Ops V2 Finance Check

**Date:** 2026-07-03
**Status:** Verification-only. No code, flag, or schema change. `QUOTE_BOOKING_CREATE` remains OFF.
**Goal:** confirm a converted booking preserves and clearly exposes the accepted-quote financial snapshot, read-only, for a controlled pilot.

---

## Files inspected
- `apps/api/src/quotes/quotes.service.ts` — `buildBookingSnapshotFromAcceptedVersion` (pricingSnapshotJson) + service mapping (per-row cost/sell).
- `apps/api/src/bookings/bookings.service.ts` — booking finance summary computation (~L9455–9580).
- `apps/admin-web/app/operations/v2/ops-finance-vm.ts` — `buildFinanceVM` (FE view model).
- `apps/admin-web/components/ops/v2/finance-summary.tsx`, `finance-tab.tsx` — the read-only Ops V2 finance UI.
- `apps/api/src/finance/quote-booking-pricing-integrity.test.ts` — existing quote→booking pricing/profit integrity coverage.

## Files changed
**None** — this is a verification slice; the one required improvement is reported below as a recommendation, not applied.

---

## 1. What a converted booking stores (verified)
- **`pricingSnapshotJson`** — `{ pricingMode, pricingType, bookingType, totalCost, totalSell, pricePerPax, fixedPricePerPerson, validUntil, pricingSlabs, scenarios }` from the accepted version.
- **`snapshotJson`** — full accepted-version clone (includes `quoteCurrency`, `adults`, `children`, quoteItems, etc.).
- **Per-service (`BookingService`)** — `unitCost`, `unitSell`, `totalCost`, `totalSell`, `supplierPayableAmount`, `supplierPayableStatus`, `qty`, `participantCount`. Net/sell values are copied verbatim from the snapshot item (unit = total ÷ qty; **no re-pricing** — Slice 1B).
- **Pax** — `adults`/`children`/`pax` on the booking. **Currency** — present as `quoteCurrency` in `snapshotJson` (see §4 gap on how the finance view reads it).

## 2. Ops V2 finance visibility (verified)
The backend finance summary (`bookings.service.ts:9467–9483`) is **snapshot-sourced**:
- `quotedTotalCost` / `quotedTotalSell` ← `pricingSnapshotJson.totalCost/totalSell` (fallback: `snapshotJson` totals, then sum of snapshot item costs).
- `realizedTotalCost` / `realizedTotalSell` ← sum of active `BookingService.totalCost/totalSell`.
- `quotedMargin` / `realizedMargin` and their percents ← computed from the above.
- Warnings: `hasNegativeMargin`, `hasLowMargin`/`hasLowMarginWarning` (realized margin < 10%).

The Ops V2 Finance tab (`FinanceSummary`) shows: **Gross selling total (Quoted total) ✓**, **Realized cost ✓**, **Margin + % ✓**, **currency label ✓**, payment count, and client/supplier payment tables.

| Requirement | Status |
|---|---|
| Gross selling total visible | ✅ Quoted total (from snapshot) |
| Net cost visible (role-appropriate) | ✅ Realized cost — Ops V2 is admin/operations-only (internal) |
| Margin visible (role-appropriate) | ✅ Margin + % — same internal surface |
| Currency visible | ⚠️ Shown, but defaults to USD for a converted booking — see §4 |
| Missing/thin costs flagged | ✅ low/negative-margin warnings (when realized sell > 0) |

## 3. Read-only behavior (verified)
- The Finance tab is **display-only**: "Future finance actions render DISABLED + 'Coming later'." No mark-paid / invoice / send controls are wired.
- The summary is a **GET-time computation** from the booking's snapshot + persisted service rows — it does **not** re-read or re-price from live quote data.
- No finance field is mutated by viewing the tab.
- The whole Operations V2 surface (and the underlying booking endpoints) is role-gated to **admin/operations**, so internal cost/margin is not exposed on any client-facing surface.

**Coverage:** `quote-booking-pricing-integrity.test.ts` already exercises quote→booking pricing/profit integrity end-to-end through the accepted-version snapshot; `bookings-operations-core.test.ts` asserts `finance.quotedTotalSell` is snapshot-sourced. No new test is required for the verified behavior.

## 4. Finding: currency defaults to USD on a converted booking (the one gap)
- `pricingSnapshotJson` does **not** carry `quoteCurrency`, and the backend finance **summary object omits `currency`** entirely.
- The FE view model derives currency from `clientPayments[0]?.currency || supplierPayments[0]?.currency || 'USD'`.
- A **freshly converted booking has no payments**, so the Finance tab labels all amounts **USD** regardless of the quote's real currency. The **numbers are correct**; only the currency **label/symbol** is wrong for a non-USD quote.

**Severity:** display-only, read-only, non-corrupting. **Not a blocker for a USD pilot** (the default `quoteCurrency`). **Should be fixed before any non-USD (JOD/AED) pilot.**

**Recommended fix (small, no schema — reported, not applied):**
1. Add `currency: snapshot.quoteCurrency ?? 'USD'` to the `pricingSnapshotJson` in `buildBookingSnapshotFromAcceptedVersion` (additive JSON field).
2. Include `currency` in the backend finance summary return (read from `pricingSnapshotJson.currency`).
3. In `buildFinanceVM`, prefer `finance.currency` over the payments-derived fallback.

This touches the shared snapshot builder (so it also improves Classic-converted bookings) but adds **no schema/migration**. Best handled as its own tiny reviewed slice.

---

## 5. Whether any code change is needed
- **For a USD-quote controlled pilot: no code change required.** Snapshot totals, realized cost, margin, and warnings are all present, correct, snapshot-sourced, and read-only.
- **For a non-USD pilot: apply the §4 currency fix first** (or accept USD-labeled figures knowingly).

## 6. Remaining blocker before controlled pilot enablement
- **No hard finance blocker for a USD pilot.**
- **Conditional:** the §4 currency label fix before a non-USD pilot.
- Carried from earlier slices (unchanged): the Slice 1B pilot supplier-data check (supplierIds resolve, categories map) so converted bookings don't arrive dominated by "Needs Assignment" rows. Enable requires **both** flags ON per the launch-control runbook (`docs/booking-creation-v2-launch-control.md`).
