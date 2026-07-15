# Supplier Data Cleanup — Amman West Remaining Services Target Decision Plan

**Date:** 2026-07-15
**Status:** Read-only decision plan. No code, schema, flag, environment, or **data** change accompanies
this report. **No data was edited.**

Decides the target-supplier structure needed for the five remaining non-hotel Amman West services
before any move. **Decision: HOLD all five for now** pending pricing-owner decisions.

---

## 1. Scope
Read-only plan only. No service / supplier / currency / rate / contract row was created, updated,
deleted, or reassigned; no supplier was created.

## 2. Five remaining non-hotel services still linked to Amman West
After the St. George Church entrance was moved to Jordan Entrance Fees, five mis-linked non-hotel
services remain on Amman West Hotel:

| Service | category | value | references |
|---|---|---|---|
| Wadi Rum Excursion - 2 Hours | Sightseeing | 45 JOD | 1 |
| Wadi Rum Sunset Jeep Tour | Sightseeing | 48 JOD | 1 |
| Wadi Rum Jeep Tour | activity | 120 USD | 4 |
| Queen Alia Airport Meet & Assist | operational_assistance | 35 USD | 22 |
| Wadi Araba Border Assistance | operational_assistance | 55 USD | 0 |

## 3. They split into two groups
- **Wadi Rum activities** — Excursion 2h, Sunset Jeep Tour, Jeep Tour (mixed JOD + USD).
- **Ground handling / meet & assist** — Queen Alia Airport Meet & Assist, Wadi Araba Border Assistance
  (both USD).

## 4. No clean existing target supplier for the Wadi Rum trio
There is **no dedicated Wadi Rum activity supplier**. The nearest existing supplier does Petra / Jerash /
Amman touring and is already a mixed-currency (CURRENCY_MISMATCH) supplier, so it is neither the correct
category nor a clean home. (The Wadi Rum camp is a hotel, not an activity supplier.) The two USD
meet-&-assist services also have no dedicated ground-handling supplier; assigning them to a JOD-only
supplier would create a new mismatch, while an already-USD supplier would not.

## 5. Recommended future supplier — Wadi Rum activities
Create a dedicated **Wadi Rum Activities / Excursions** supplier as the correct home for the three
Wadi Rum services (preferred over overloading the existing Petra/Jerash touring supplier).

## 6. Recommended future supplier — ground handling
Create a dedicated **Ground Handling / Meet & Assist** supplier (USD) as the correct home for the two
operational-assistance services. Both are USD, so a USD-only supplier stays single-currency with no
mismatch.

## 7. Moving all five away would clear Amman West CURRENCY_MISMATCH
After all five leave, Amman West's only remaining data is its single-currency USD hotel contract, so
its `CURRENCY_MISMATCH` clears (4 → 3). This is independent of where the services land.

## 8. But the Wadi Rum trio itself mixes JOD and USD
The three Wadi Rum services mix **JOD (45, 48) + USD (120)**. If all three land together on one new
Wadi Rum supplier as-is, that supplier becomes JOD + USD and a **new `CURRENCY_MISMATCH` appears there**
— net effect: Amman West clears but the new supplier gains one, so the total does not fall. Moving them
without currency normalization would just **relocate** the mismatch. (The USD meet-&-assist pair has no
such problem — a USD home adds no mismatch.)

## 9. Pricing-owner decisions needed
1. **Wadi Rum trio currency normalization** — is the 120 USD Jeep Tour correctly USD, or should it match
   the JOD pair (or the pair be USD)? This gates any *net* warning reduction. No value/currency change is
   to be made until approved.
2. **Whether to create the two new suppliers** (Wadi Rum Activities; Ground Handling / Meet & Assist)
   vs. reusing existing suppliers.
3. **Final target assignment** for each service (and its correct type/category).

## 10. Recommended sequencing
1. **Keep all five held for now** — they are mis-linked but stable; Amman West already carries the
   `CURRENCY_MISMATCH`, so no new harm.
2. **Decide the Wadi Rum trio currency** (pricing owner).
3. **Create the suppliers** if approved.
4. **Normalize the Wadi Rum currency** if approved.
5. **Then reassign in clean batches** (Wadi Rum ×3, Ground Handling ×2). Only this sequence yields a
   net 4 → 3 with no relocated mismatch.

## 11–14. Confirmations
- **No data was edited.**
- **No email was sent.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- No raw identifiers (supplier / service / quote IDs), secrets, hosts, URLs, project identifiers,
  session tokens, or connection details are recorded here — only service names, categories, currencies,
  reference counts, and the recommendation.
