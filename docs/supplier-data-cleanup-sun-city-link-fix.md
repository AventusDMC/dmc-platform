# Supplier Data Cleanup — Sun City Supplier-Link Fix Report

**Date:** 2026-07-13
**Status:** Completed. Documentation only — no code, schema, flag, or environment change accompanies
this report, and no further data edits were made.

A single, deterministic data-linkage cleanup: the "Sun City Camp Wadi Rum" hotel was linked to the
wrong supplier, which produced a false `NO_ACTIVE_SERVICES` warning on the real Sun City supplier
(surfaced during the Product Catalog V2 Slice 5 validation). Only the hotel's supplier link was
corrected.

---

## 1. Root cause
The **Sun City Camp Wadi Rum** hotel record was linked (via its hotel `supplierId`) to
**RateHawk Inventory** instead of the real **Sun City Camp Wadi Rum** supplier. As a result, the Sun
City hotel contract was attributed to RateHawk, so the real Sun City supplier appeared to have no
active hotel contract and was falsely flagged `NO_ACTIVE_SERVICES`. Its `resolvedSupplierId` was empty.

There was **no duplicate Sun City supplier row** — a single real Sun City supplier exists; the hotel
was simply pointed at the wrong supplier.

## 2. Fix applied
Updated **only** the Sun City hotel's `supplierId` to point at the real **Sun City Camp Wadi Rum**
supplier (via the hotel update path). Minimum-field edit:
- `resolvedSupplierId` unchanged (left as-is).
- No rates, room categories, hotel contract, currency, or supplier-email fields changed.
- No rows deleted.
- No other hotel, supplier, or contract touched.
- Nothing marked VERIFIED.

## 3. Before / after linkage
| | Before | After |
|---|---|---|
| Sun City hotel → supplier | RateHawk Inventory (wrong) | **Sun City Camp Wadi Rum (correct)** |
| Sun City supplier `activeHotelContractCount` | 0 → flagged NO_ACTIVE_SERVICES | **1 → cleared** |
| RateHawk `activeHotelContractCount` | 3 → cleared | **2 → still cleared** |

## 4. Before / after warningCounts
| Code | Before | After |
|---|---|---|
| NO_ACTIVE_SERVICES | 6 | 5 |
| Total | 31 | 30 |
| MISSING_EMAIL | 6 | 6 |
| MULTIPLE_EMAILS | 0 | 0 |
| MISSING_RATES | 6 | 6 |
| UNVERIFIED_HOTEL_CONTRACT | 8 | 8 |
| CURRENCY_MISMATCH | 4 | 4 |
| MISSING_BASE_CITY | 1 | 1 |
| EXPIRED_CONTRACT / EXPIRING_SOON | 0 / 0 | 0 / 0 |

`NO_ACTIVE_SERVICES` **6 → 5**, total **31 → 30**, all other counts unchanged — exactly as expected.

## 5. RateHawk correction (honest note)
The earlier Slice 5 validation described RateHawk as having three active hotel contracts. One of those
three was in fact this **mislinked Sun City contract**. This cleanup corrected the underlying data, so
RateHawk now correctly shows **two** active hotel contracts and remains cleared. RateHawk was not
edited directly — it simply, and correctly, no longer claims the Sun City contract.

## 6. References found (reported; not blockers)
The Sun City hotel/contract is referenced by **30 quote items**. Per Ziad's confirmation, the system
is still in the testing phase and these are **test data**, so quote/booking references are not
blockers. The relink changed only the hotel's supplier link (not the hotel identity), so all 30
references remain intact and existing quotes remain frozen snapshots.

## 7. Confirmations
- **No rates / prices / currencies / contracts changed** — only the hotel's supplier link changed; the
  Sun City contract's currency, confidence, validity dates, and quote-item count are identical before
  and after.
- **No hotel-contract rates edited; nothing marked VERIFIED; no rows deleted.**
- **No email sent** — a hotel field write has no mail path.
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled; no flags changed.**

### Safety confirmations
- Documentation only — no code, schema, flag, or environment change in this report.
- No additional data edits were made while producing this document.
- No raw identifiers (supplier / hotel / contract IDs), secrets, hosts, URLs, project identifiers,
  session tokens, or connection details are recorded here — only supplier/hotel names and warning
  counts.
