# Supplier Data Cleanup — Batch 3B (Pricing / Currency) Edit Preflight

**Date:** 2026-07-13
**Status:** Read-only preflight. No code, schema, flag, environment, or **data** change accompanies
this report. **No data was edited.**

Batch 3B prepares the exact pricing-owner-approved cleanup options for the remaining real Product
Catalog V2 warnings (MISSING_RATES, CURRENCY_MISMATCH) plus the General Transport and un-contracted
hotel decisions — without editing anything.

---

## 1. Scope
Read-only preflight only. Values were read via GET (Catalog V2 summary + services). No supplier,
service, rate, currency, or contract field was created, updated, or deleted; no supplier was
deactivated; nothing was marked VERIFIED.

## 2. Current state
Total warnings = **30**. Targets: MISSING_RATES (6), CURRENCY_MISMATCH (4), plus the remaining
General Transport and un-contracted hotel decisions (both NO_ACTIVE_SERVICES-related).

## 3. Main targets
- MISSING_RATES
- CURRENCY_MISMATCH
- Remaining General Transport / un-contracted hotel decisions

## 4. Key finding (do not edit to "clear" artifacts)
- The entrance-fee and hotel-night MISSING_RATES flags are **mostly baseCost artifacts**: the services
  carry their price in `SupplierService.baseCost`, but the catalog's `rateRows` figure counts only
  `serviceRate` / `vehicleRate` rows.
- **Setting `baseCost` does NOT clear MISSING_RATES** unless `serviceRate` / `vehicleRate` rows exist.
- **Do not add `serviceRate` rows just to clear the warning** — the service is already priced via
  `baseCost`, so adding a rate row risks **double-pricing** future quotes.
- Consequence: the pricing edits below (hotel-night cost, entrance-fee prices) are **data-quality**
  fixes with **no warning-count impact**; only the currency and contract items move counts.

## 5. The House Boutique Suites Amman
- **Current:** one accommodation service ("Jordan Contracted Hotel Night") at **baseCost 0 JOD**.
- **Real pricing gap** — a hotel night priced at 0 would price at 0 in future quotes.
- **Needs a pricing-owner value before edit** (the correct contracted per-night cost).
- **Warning impact:** likely **none** (MISSING_RATES is the baseCost artifact and stays).
- Existing quotes are frozen snapshots — unaffected. Decision: **EDIT** once the value is supplied.

## 6. Jordan Entrance Fees
- **8 of 65 services are at baseCost 0**, in two groups:
  - **5 × `included_non_sellable`** (e.g. the Petra Archaeological / Nabataean museums, Jerash
    Archaeological Museum, Ajloun Museum, Mar Elyas) — **accepted as 0** (included, not sold
    separately).
  - **3 × Activity-category** zero-cost items — **need a pricing-owner decision: free vs unpriced**
    (many Jordanian municipal museums are genuinely free).
- **Warning impact:** none (supplier MISSING_RATES is the baseCost artifact; 57 items are priced).

## 7. Desert Compass Experiences
- **Current:** three sightseeing services — two priced in USD and one in **EUR** (a seed-style row)
  causing CURRENCY_MISMATCH.
- **Needs pricing-owner confirmation of the correct USD value** before edit (correct the currency to
  USD with the right value — do not merely flip the symbol).
- **Expected warning impact if corrected:** **CURRENCY_MISMATCH 4 → 3**.
- Decision: **EDIT** once currency + value are confirmed.

## 8. Amman West Hotel
- **Current:** six services mixing JOD and USD → CURRENCY_MISMATCH. The services (Wadi Rum jeep tours,
  a Madaba church entrance, airport/border assistance) are thematically unrelated to an Amman hotel
  and **look mislinked** (same class of issue as the Sun City mislink). Its hotel contract is a
  separate held UNVERIFIED item.
- **HOLD until the service attribution is reviewed** — do not normalize currency on possibly-mislinked
  services. Decision: **HOLD**.

## 9. Desert Compass Transport
- **Current:** one unpriced transfer service (baseCost 0) + one priced meet-and-assist, plus two
  **inactive/empty** transport contracts, with a JOD/USD mix → MISSING_RATES + CURRENCY_MISMATCH.
- **HOLD for a dedicated transport review** (price the transfer, decide the empty contracts, resolve
  currency) — multi-step, not a single safe edit. Decision: **HOLD**.

## 10. General Transport
- **Current:** stub — no services, no contracts, no email/phone/currency; warnings MISSING_EMAIL +
  NO_ACTIVE_SERVICES + MISSING_BASE_CITY.
- **Deactivation decision only after a reference check** (confirm no quote/booking references, per the
  Sun City lesson). If deactivated, its 3 warnings drop (total −3). Decision: **DEACTIVATE** (pending
  reference check + a deactivation mechanism); no delete.

## 11. Four un-contracted hotels
- Mövenpick Hotels & Resorts – Jordan, Olive Branch Hotel Jerash, Grand Hyatt Amman, DoubleTree by
  Hilton Aqaba — all with no contract loaded (NO_ACTIVE_SERVICES; two also MISSING_EMAIL).
- **Load a hotel contract (if offered) or retire (if not)** — a pricing-owner decision. Loading all
  four contracts would take NO_ACTIVE_SERVICES 5 → 1. Decision: **HOLD / pricing-owner decision**.

## 12. Do-not-edit items
- **Accepted baseCost artifacts** — the baseCost-priced MISSING_RATES suppliers (Petra Moon,
  Jordanian Table Catering, Desert Compass Guides, the priced Jordan Entrance Fees).
- **Alpha Bus and Limo Co** — intentional dual currency (JOD small vehicles / USD coaches).
- **Accepted non-sellable entrance fees** — the 5 `included_non_sellable` zero-cost items.

## 13. Risks
- **Double-pricing** — adding a `serviceRate` to a baseCost-priced supplier.
- **Wrong currency normalization** — flipping a currency without re-pricing, or collapsing an
  intentional dual currency.
- **Pricing genuinely-free items** — over-charging clients for free/included entrances.
- **Deactivating referenced suppliers** — check references first (General Transport, hotels).
- **Changing future quote economics** — any rate/currency edit affects future quotes (existing quotes
  are frozen snapshots).

## 14. No data was edited
This preflight is analysis only. No supplier / service / rate / currency / contract field was created,
updated, or deleted; no supplier was deactivated; nothing was marked VERIFIED.

## 15. Voucher-send allowlist
Remains `ziad@axisdmc.com` only.

## 16. Supplier sending
Remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- No raw identifiers (supplier / service / contract IDs), secrets, hosts, URLs, project identifiers,
  session tokens, or connection details are recorded here — only supplier/service names and warning
  counts.
