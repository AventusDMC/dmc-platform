# Supplier Data Cleanup — Jordan Entrance Fees Zero-Cost Activity Preflight

**Date:** 2026-07-14
**Status:** Read-only preflight. No code, schema, flag, environment, or **data** change accompanies
this report. **No data was edited.**

Reviews the 8 zero-cost Jordan Entrance Fees services to decide which are legitimately free / included
versus truly unpriced.

---

## 1. Scope
Read-only preflight only. Values were read via read-only queries. No service / rate / currency /
supplier row was created, updated, deleted, or deactivated.

## 2. Supplier MISSING_RATES is a baseCost artifact
The Jordan Entrance Fees supplier's `MISSING_RATES` warning is a **baseCost artifact**: the services
are priced via `baseCost` (57 of 65 carry real prices), but the catalog's rate-row count only counts
`serviceRate` / `vehicleRate` rows (of which the supplier has none). So MISSING_RATES will not change
based on these zero-cost entries.

## 3. Supplier email
The supplier email is **null** (`MISSING_EMAIL`). This is a **separate, post-launch supplier-send
hygiene** item, not part of this pricing review.

## 4. Eight zero-cost services
There are **8 services with `baseCost 0`**, all in JOD.

## 5. Split
- **5 `included_non_sellable`** items.
- **3 `Activity`** items.

## 6. The 5 `included_non_sellable` items — stay 0 (ACCEPT_AS_FREE)
Category means "included, not sold separately" — these are bundled into their parent site tickets /
excursions (e.g. the two Petra museums are inside the Petra ticket; Jerash Archaeological Museum is
included in the Jerash site and is attached to one excursion component). **`baseCost 0` is correct**;
no action.

Items: Ajloun Museum, Jerash Archaeological Museum, Mar Elyas / St. Elijah's Hill, The Petra
Archaeological Museum, The Petra Nabataean Museum (entrance fees).

## 7. The 3 `Activity` items — likely free or nominal, currently unused
All three are active `Activity` museum/memorial entrance fees in JOD that appear **likely free or
nominal** and are **not currently used**:
- **Martyr's Memorial & Military Museum Entrance Fee** (Amman) — a national war memorial; such sites
  are typically free entry.
- **Mazar Islamic Museum Entrance Fee** — a small regional Islamic / municipal museum, commonly free.
- **The Museum of Jordanian Heritage Entrance Fee** (Yarmouk University, Irbid) — a university museum,
  historically free or nominal.

## 8. Reference counts
All 3 Activity items have **0 quote / booking references** (0 quote items, 0 service rates, 0
excursion / package components, 0 quote blocks, 0 ticket-rate variants). They are unused in any quote,
so neither leaving them at 0 nor pricing them affects any current quote.

## 9. Recommendation
- **ACCEPT_AS_FREE** for all three, pending a **light pricing-owner confirmation**.
- **Only price an item later if the pricing owner confirms it is actually paid** — and even then it
  can be priced when the item is next used.

## 10. Expected warning impact
- **None.** The supplier's `MISSING_RATES` is a baseCost / rate-rows artifact and **will not clear**
  regardless of whether these baseCosts stay 0 or are set.

## 11. Future quote risk
- **Low but not zero:** since all 3 Activity items have 0 current references, leaving them at 0
  affects no existing quote. The only residual risk is a *future* quote using one of them if it were
  actually a paid site (it would price at 0). Low, given zero current usage and the likely-free
  nature.

## 12–15. Confirmations
- **No data was edited.**
- **No email was sent.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- No raw identifiers (supplier / service IDs), secrets, hosts, URLs, project identifiers, session
  tokens, or connection details are recorded here — only service names, categories, currencies,
  reference counts, and the recommendation.
