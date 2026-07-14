# Supplier Data Cleanup — Final Warning Refresh

**Date:** 2026-07-14
**Status:** Read-only refresh. No code, schema, flag, environment, or **data** change accompanies this
report. **No data was edited.**

A live snapshot of the Product Catalog V2 warnings after all completed supplier cleanup and
accepted-artifact decisions.

Completed cleanup reflected here:
- Batch 1 baseCity cleanup + Alpha email normalization
- Corp Amman FOC correction
- Corp / Olive / Petra Moon hotel-contract verification
- Product Catalog Slice 5 NO_ACTIVE_SERVICES model fix
- Sun City supplier-link fix
- General Transport hard-delete
- Alpha accepted dual-currency decision

---

## 1. Scope
Read-only refresh via a GET of the Catalog V2 summary. Nothing was created, updated, deleted,
deactivated, or verified.

## 2. Current warningCounts

| Code | Count |
|---|---|
| MISSING_EMAIL | 5 |
| MULTIPLE_EMAILS | 0 |
| MISSING_RATES | 6 |
| EXPIRED_CONTRACT | 0 |
| EXPIRING_SOON | 0 |
| UNVERIFIED_HOTEL_CONTRACT | 8 |
| NO_ACTIVE_SERVICES | 4 |
| CURRENCY_MISMATCH | 4 |
| MISSING_BASE_CITY | 0 |
| **Total** | **27** |

(23 suppliers, 12 hotel contracts, 4 verified.)

## 3. Trajectory vs baselines

| Milestone | Total |
|---|---|
| Original baseline | 46 |
| Post Batch 1 | 42 |
| Post Batch 2B | 39 |
| Post Slice 5 | 31 |
| Post Sun City | 30 |
| Post General Transport | 27 |
| Current | 27 |

Current = **27**, matching the post-General-Transport figure — nothing changed since (the Corp Amman
FOC correction moved no count; the Alpha JOD preflight was read-only / accept-no-edit). Net cleanup:
**46 → 27 (−19)**.

## 4. Completed cleanup impact
- **MULTIPLE_EMAILS cleared** (1 → 0) — Alpha email normalized in Batch 1.
- **MISSING_BASE_CITY cleared** (4 → 0) — three set in Batch 1; the last (General Transport) removed by
  the hard-delete.
- **UNVERIFIED_HOTEL_CONTRACT reduced 11 → 8** — Corp Amman, Olive Hotel Amman, and Petra Moon verified
  in Batch 2B.
- **NO_ACTIVE_SERVICES reduced to 4** — Slice 5 cleared the hotel-contract false positives, the Sun
  City supplier-link fix cleared Sun City, and the General Transport delete removed the stub; the
  remaining 4 are genuinely un-contracted hotels.

## 5. Remaining warnings by category

**A. True data cleanup needed (real gaps):**
- The House Boutique Suites — hotel-night service `baseCost 0` (MISSING_RATES); needs a pricing-owner
  value.
- Desert Compass Experiences — EUR seed-style row (CURRENCY_MISMATCH); correct currency + value.

**B. Accepted artifact / no edit:**
- MISSING_RATES baseCost-priced suppliers (Petra Moon Hotel, Jordanian Table Catering, Desert Compass
  Guides, priced Jordan Entrance Fees) — priced via baseCost; adding rate rows would double-price.
- CURRENCY_MISMATCH — Alpha Bus and Limo Co: genuine dual currency (USD transfers/package + JOD
  touring). Accepted.
- Jordan Entrance Fees' 5 `included_non_sellable` zero-cost items — legitimately free/included.

**C. Pricing-owner decision needed:**
- Amman West Hotel — JOD/USD service mix + likely mislinked services + a held UNVERIFIED contract.
- Desert Compass Transport — HOLD: zero vehicle rates, unpriced transfer, empty no-window JOD
  contracts; dedicated transport review.
- 3 `Activity` zero-cost entrance fees — confirm free vs unpriced.
- 4 un-contracted hotels (Mövenpick Hotels & Resorts – Jordan, Olive Branch Hotel Jerash, Grand Hyatt
  Amman, DoubleTree by Hilton Aqaba) — load a contract or retire.
- 8 UNVERIFIED_HOTEL_CONTRACTs — the held set — verify after resolving supplement / pricing /
  duplicate findings.

**D. Post-launch supplier-send hygiene:**
- MISSING_EMAIL (5) — relevant only once supplier send is enabled (post-launch, allowlist-gated); not
  launch-blocking.

## 6. Top 3 recommended next actions
1. **Desert Compass Experiences — EUR seed row** (pricing-owner confirms the USD value): cleanest
   genuine CURRENCY_MISMATCH win (4 → 3), single row, no dual-currency complexity.
2. **The House Boutique Suites — `baseCost 0`** (pricing-owner supplies the per-night cost): a real
   pricing gap; data-quality fix (note: won't drop MISSING_RATES, which is the baseCost artifact, but
   fixes the wrong price).
3. **4 un-contracted hotels — offer-vs-retire decision** (pricing-owner): if offered, loading
   contracts clears NO_ACTIVE_SERVICES (4 → 0); if not, retire. Highest count leverage.

*(Amman West and Desert Compass Transport remain HOLDs pending attribution / dedicated transport
review; the 8 UNVERIFIED contracts are a separate verification track; Alpha and the baseCost artifacts
are accepted / no edit.)*

## 7. Confirmations
- **No data was edited during the refresh.**
- **No email was sent.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- No raw identifiers (supplier IDs), secrets, hosts, URLs, project identifiers, session tokens, or
  connection details are recorded here — only names, counts, and categories.
