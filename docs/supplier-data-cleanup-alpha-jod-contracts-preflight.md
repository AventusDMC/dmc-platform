# Supplier Data Cleanup — Alpha JOD Contracts Cleanup Preflight

**Date:** 2026-07-14
**Status:** Read-only preflight. No code, schema, flag, environment, or **data** change accompanies
this report. **No data was edited.**

Investigates whether Alpha Bus and Limo Co's JOD no-validity-window ROUTE_TRANSFER contracts are stale
legacy rows that could be soft-deactivated. **Conclusion: they are not — do not soft-deactivate.**

---

## 1. Scope
Read-only preflight only. Values were read via read-only queries. No supplier / service / rate /
contract / currency row was created, updated, deleted, or deactivated.

## 2. No data was edited
Nothing was changed. This is analysis only.

## 3. Alpha's actual priced operation
Alpha Bus and Limo Co operates in **two currencies by design**:
- **USD per-transfer vehicle rates** — the full route-transfer operation (all vehicle rates are USD,
  active, across all vehicle classes).
- **USD package rates** — coach daily package pricing (Large Bus and Medium Bus full-day / half-day).
- **JOD touring-route pricing** — touring routes are priced in JOD, anchored to the JOD contracts.

## 4. The JOD contracts are referenced by 49 TouringRoutePricing rows
The JOD no-window ROUTE_TRANSFER contracts have **zero vehicle rates** but are referenced by **49
`TouringRoutePricing` rows** in total (spread across the vehicle classes). They are the JOD anchor for
Alpha's touring-route pricing — i.e. **live, in-use contracts**, not orphans.

## 5. The "stale legacy rows" idea is withdrawn
The earlier interpretation — that these JOD contracts were stale legacy leftovers with zero rates —
is **withdrawn**. The zero vehicle-rate count masked 49 active touring-route-pricing references.

## 6. Do not soft-deactivate the JOD contracts
Given the 49 live references, **do not soft-deactivate** these contracts.

## 7. Soft-deactivation would risk touring pricing
Touring-route pricing selection typically relies on active contracts, so setting these contracts
`active = false` would likely **break or alter the 49 JOD touring-route pricings** — affecting future
touring quotes.

## 8. Soft-deactivation would not clear CURRENCY_MISMATCH
Even setting them inactive would **not** clear Alpha's `CURRENCY_MISMATCH`: Product Catalog V2 derives
a supplier's currency set from **all** linked contract currencies **regardless of the `active` flag**,
so JOD would remain in the set. The change would carry downside (touring-pricing risk) with **no
warning benefit**.

## 9. Correct interpretation
- Alpha is a **genuine dual-currency transport supplier** (USD per-transfer / package + JOD touring).
- Alpha's `CURRENCY_MISMATCH` should be **accepted** as an intended reflection of that dual-currency
  operation — **unless a pricing owner later decides to migrate the touring pricing to a single
  currency** (a real re-pricing decision, not a contract deactivation).

## 10. Supersedes the earlier Transportation Catalog V2 recommendation
This preflight **supersedes** the "Alpha legacy JOD contracts → review / possible soft-deactivate"
recommendation in the merged Transportation Catalog V2 data review. That recommendation is withdrawn
in light of the 49 touring-route-pricing references; the correct action is **accept the mismatch**, not
deactivate.

## 11. No email was sent
Read-only queries only; no mail path exercised.

## 12. Voucher-send allowlist
Remains `ziad@axisdmc.com` only.

## 13. Supplier sending
Remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- No raw identifiers (supplier / contract / rate IDs), secrets, hosts, URLs, project identifiers,
  session tokens, or connection details are recorded here — only currencies, regimes, reference
  counts, and the recommendation.
