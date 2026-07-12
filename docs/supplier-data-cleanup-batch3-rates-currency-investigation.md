# Supplier Data Cleanup — Batch 3 (Rates / Currency) Read-Only Investigation

**Date:** 2026-07-12
**Status:** Read-only investigation. No code, schema, flag, environment, or **data** change
accompanies this report. **No data was edited.**

Batch 3 investigated the remaining pricing-sensitive Product Catalog V2 warnings (MISSING_RATES,
CURRENCY_MISMATCH), the last MISSING_BASE_CITY (General Transport), and the NO_ACTIVE_SERVICES
modeling artifact — without editing anything.

---

## 1. Scope
Read-only investigation only. Values were read via GET (Catalog V2 summary + per-service pricing). No
supplier, service, rate, currency, or contract field was created, updated, or deleted; no supplier was
deactivated; nothing was marked VERIFIED.

## 2. Current warningCounts

| Code | Count |
|---|---|
| MISSING_EMAIL | 6 |
| MULTIPLE_EMAILS | 0 |
| MISSING_RATES | 6 |
| EXPIRED_CONTRACT | 0 |
| EXPIRING_SOON | 0 |
| UNVERIFIED_HOTEL_CONTRACT | 8 |
| NO_ACTIVE_SERVICES | 14 |
| CURRENCY_MISMATCH | 4 |
| MISSING_BASE_CITY | 1 |
| **Total** | **39** |

## 3. Main finding
The catalog's `rateRows` figure counts only `serviceRate` / `vehicleRate` rows — it does **not** count
a `SupplierService.baseCost`. Several MISSING_RATES warnings are therefore **modeling artifacts**: the
service is already priced through its `baseCost`, so the warning fires even though a price exists.

## 4. MISSING_RATES classification (6)

| Supplier | Evidence | Classification |
|---|---|---|
| Petra Moon Hotel | 1 service, baseCost 15 USD | **ACCEPT_AS_ARTIFACT** |
| Jordanian Table Catering | 1 service, baseCost 24 USD | **ACCEPT_AS_ARTIFACT** |
| Desert Compass Guides | 1 service, baseCost 120 USD | **ACCEPT_AS_ARTIFACT** |
| Jordan Entrance Fees | 65 services — 57 priced, **8 baseCost 0** | **mostly artifact**; the 8 baseCost-0 items **NEED_PRICING_OWNER_DECISION** (free vs unpriced). Also MISSING_EMAIL. |
| The House Boutique Suites Amman | 1 service, **baseCost 0** JOD | **NEEDS_PRICING_OWNER_DECISION** |
| Desert Compass Transport | 1 priced + 1 unpriced service + 2 inactive/empty transport contracts | **HOLD** |

## 5. CURRENCY_MISMATCH classification (4)

| Supplier | Evidence | Classification |
|---|---|---|
| Alpha Bus and Limo Co | 7 USD services + 496 rate rows; JOD via vehicle rate cards (small vehicles) | **ACCEPT_AS_ARTIFACT** (intentional dual currency) |
| Desert Compass Experiences | 2 real USD services + 1 EUR service with a seed-style identifier | **NEEDS_CURRENCY_DECISION** |
| Amman West Hotel | genuine JOD + USD service mix (plus one seed-style JOD row) | **NEEDS_CURRENCY_DECISION** |
| Desert Compass Transport | services USD; JOD from the 2 inactive contracts | **HOLD** |

## 6. General Transport
Confirmed **stub / inactive**: null email, null phone, no currency, no services, no contracts,
`operationallyActive = false` (warnings MISSING_EMAIL + NO_ACTIVE_SERVICES + MISSING_BASE_CITY). A
**deactivation candidate** — **no edit made** (and the remaining MISSING_BASE_CITY is moot for a stub).

## 7. NO_ACTIVE_SERVICES (14)
The supplier-level "active" check counts only supplier-services + transport contracts, **not** hotel
contracts.
- **8 = likely modeling artifact** — hotels that DO have a hotel contract but 0 supplier-services
  (Sun City Camp Wadi Rum, Amman Rotana Hotel, Dead Sea Spa Hotel, Olive Hotel Amman, Crowne Plaza
  Dead Sea, Holiday Inn Resort Dead Sea, Corp Amman Hotel, Old Village Resort). The proper fix is an
  **engineering / modeling change** (count hotel contracts toward "active"), **not** data cleanup.
- **4 = un-contracted hotels** (no matching hotel contract): Mövenpick Hotels & Resorts – Jordan,
  Olive Branch Hotel Jerash, Grand Hyatt Amman, DoubleTree by Hilton Aqaba — pricing-owner decision
  (load a contract or retire).
- **1 = external integration** (expected empty): RateHawk Inventory — accepted artifact.
- **1 = transport stub:** General Transport.

## 8. Items that should NOT be edited
- baseCost-priced MISSING_RATES suppliers (Petra Moon, Jordanian Table Catering, Desert Compass
  Guides, the 57 priced entrance fees) — adding rate rows risks **double-pricing**.
- Alpha Bus and Limo dual currency — intentional; collapsing to one currency would mis-price.
- RateHawk Inventory and the 8 hotel-contract NO_ACTIVE_SERVICES hotels — accepted artifacts.

## 9. Items requiring pricing-owner approval
- The House Boutique Suites `baseCost 0`.
- The 8 zero-cost Jordan Entrance Fees (free vs unpriced).
- Desert Compass Experiences EUR seed-style row.
- Amman West Hotel JOD / USD mix.
- Desert Compass Transport (rates + currency + inactive contracts).
- The 4 un-contracted hotels.

Any actual rate/currency edit is pricing-sensitive: it affects **future** quotes (existing quotes are
frozen snapshots).

## 10. Proposed split
- **Batch 3A — accept-as-artifact documentation (zero edits):** record the ACCEPT_AS_ARTIFACT set
  (baseCost-priced MISSING_RATES, Alpha dual currency, RateHawk, the 8 hotel-contract
  NO_ACTIVE_SERVICES) as accepted/known, and open a separate **engineering ticket** for the
  NO_ACTIVE_SERVICES hotel-contract modeling fix. No data changes.
- **Batch 3B — pricing-owner-approved edits (individual, later):** The House `baseCost 0`; the two
  seed-style currency rows; Amman West currency; the 8 zero-cost entrance fees; Desert Compass
  Transport; the 4 un-contracted hotels; the General Transport deactivation. Each approved and
  validated one at a time.

## 11. Risks
- **Double-pricing** if a rate row is added to a baseCost-priced artifact supplier.
- **Wrong currency normalization** if Alpha's intended JOD + USD is collapsed to one currency.
- **Seed row mistaken for a real row** — verify the seed-style identifiers before acting.
- **Intentionally-free items mistaken for a missing price** — some entrance sites are genuinely free.
- **Deactivating a supplier still referenced** by quotes/bookings (General Transport, un-contracted
  hotels) — check references first.

## 12. No data was edited
This investigation is analysis only. No supplier / service / rate / currency / contract field was
created, updated, or deleted, and no supplier was deactivated.

## 13. Voucher-send allowlist
Remains `ziad@axisdmc.com` only.

## 14. Supplier sending
Remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- Read-only inspection used a session secret pulled into a temporary file that was deleted
  immediately; no secrets, hosts, URLs, project identifiers, session tokens, or connection details are
  recorded here.
