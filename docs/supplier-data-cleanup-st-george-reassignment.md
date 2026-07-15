# Supplier Data Cleanup — St. George Church Service Reassignment

**Date:** 2026-07-15
**Status:** Applied and validated. A single service `supplierId` was reassigned; no other data changed.

Reassigns the misattributed **St. George Church / Mosaic Map Entrance** service from Amman West Hotel
to Jordan Entrance Fees — the first (clean, high-confidence) reassignment from the Amman West target
mapping preflight.

---

## 1. Service moved
**St. George Church / Mosaic Map Entrance** (category `ticketing` / "Religious Site Entry", baseCost 3 JOD).

## 2. Before → after supplier
- **From:** Amman West Hotel
- **To:** Jordan Entrance Fees

## 3. Only `supplierId` changed
The sole write was the service's owning `supplierId`. No other field was sent or modified.

- Service ID: **unchanged**
- Name: **unchanged**
- Category / type: **unchanged**
- baseCost (3): **unchanged**
- Currency (JOD): **unchanged**
- Service rates: **none existed, none created**
- `resolvedSupplierId`: remained unset (the service was linked purely via `supplierId`)

## 4. References unchanged
References are held by service ID, so the supplier change left them intact:
- 20 quote items
- 1 excursion component
- 4 package components

## 5. Warning impact — Product Catalog V2 warningCounts
| Warning | Before | After |
|---|---|---|
| MISSING_EMAIL | 5 | 5 |
| MISSING_RATES | 6 | 6 |
| UNVERIFIED_HOTEL_CONTRACT | 8 | 8 |
| NO_ACTIVE_SERVICES | 4 | 4 |
| **CURRENCY_MISMATCH** | **4** | **4** |
| **Total** | **27** | **27** |

- **Total remains 27; CURRENCY_MISMATCH remains 4.**
- **Amman West's CURRENCY_MISMATCH remains** because its other non-hotel services (three Wadi Rum
  services + two operational-assistance services) are still linked there and still mix JOD + USD.
- **No new CURRENCY_MISMATCH appeared on Jordan Entrance Fees** — it is JOD-only, and the reassigned
  entrance is JOD, so the target stays single-currency.

## 6. What was NOT touched
- No other Amman West service was moved.
- The three Wadi Rum services remain untouched.
- Queen Alia Airport Meet & Assist / Wadi Araba Border Assistance remain untouched.
- The Amman West hotel contract was untouched.
- No supplier was created or deleted.

## 7. Confirmations
- **No rates / prices / currencies / contracts changed** — the only write was `supplierId`.
- **No email was sent.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

### Safety confirmations
- Documentation only — no code, schema, flag, or environment change accompanies this report.
- No raw identifiers (supplier / service / quote IDs), secrets, hosts, URLs, project identifiers,
  session tokens, or connection details are recorded here — only service names, categories, currencies,
  reference counts, and warning totals.
