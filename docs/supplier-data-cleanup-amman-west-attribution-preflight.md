# Supplier Data Cleanup — Amman West Service Attribution / Currency Preflight

**Date:** 2026-07-14
**Status:** Read-only preflight. No code, schema, flag, environment, or **data** change accompanies
this report. **No data was edited.**

Investigates Amman West Hotel's `CURRENCY_MISMATCH` and whether its linked services are misattributed
before any currency cleanup. **Conclusion: this is a service-attribution issue, not a hotel currency
issue — HOLD.**

---

## 1. Scope
Read-only preflight only. Values were read via read-only queries. No service / rate / currency /
supplier / hotel / contract row was created, updated, deleted, or deactivated.

## 2. The warning
Amman West Hotel carries `CURRENCY_MISMATCH` (its services mix JOD + USD).

## 3. The actual hotel contract is single-currency USD
Amman West's own hotel inventory is a single contract with **8 rates in USD** (2 room categories). The
hotel's real pricing is **single-currency USD** — it is not the source of the mismatch.

## 4. The mismatch is caused by 6 linked non-hotel services
The JOD + USD mix comes entirely from **6 linked services that are not hotel products**:

| Service | category | baseCost | currency | hotel-related? | references |
|---|---|---|---|---|---|
| St. George Church / Mosaic Map Entrance | ticketing | 3 | JOD | No — Madaba entrance fee | 25 (20 quote items, 4 package, 1 excursion) |
| Wadi Rum Excursion - 2 Hours | Sightseeing | 45 | JOD | No — Wadi Rum activity | 1 |
| Wadi Rum Sunset Jeep Tour | Sightseeing | 48 | JOD | No — Wadi Rum activity | 1 |
| Queen Alia Airport Meet & Assist | operational_assistance | 35 | USD | No — airport meet & assist | 22 (quote items) |
| Wadi Araba Border Assistance | operational_assistance | 55 | USD | No — border assistance | 0 |
| Wadi Rum Jeep Tour | activity | 120 | USD | No — Wadi Rum activity | 4 |

## 5. The 6 suspicious services
- St. George Church / Mosaic Map Entrance
- Wadi Rum Excursion - 2 Hours
- Wadi Rum Sunset Jeep Tour
- Queen Alia Airport Meet & Assist
- Wadi Araba Border Assistance
- Wadi Rum Jeep Tour

## 6. None appears hotel-related
All six are entrance-fee / Wadi Rum activity / airport / border services — none is an Amman hotel
product. They appear to be import/seed mislinks attributed to Amman West.

## 7. The hotel contract is a separate held item
The Amman West hotel contract ("Contractual Agreement of 2026") is `IMPORTED_UNVERIFIED`, single-currency
USD, with supplements — it remains a **separate held `UNVERIFIED_HOTEL_CONTRACT` item** on its own
verification track, unaffected by the service-attribution question.

## 8. Recommended future correction
- **Reassign the misattributed services to their correct suppliers** after ops / pricing owner confirms
  the correct target supplier for each (entrance-fee supplier for the Madaba entrance; a Wadi Rum
  activity supplier for the Wadi Rum tours; an operational-assistance / transport supplier for the
  meet & assist and border assistance).
- **Do not change any service's currency / value** until attribution is resolved — the values may be
  correct for the real supplier.

## 9. Warning impact
- **Amman West `CURRENCY_MISMATCH` could clear** (its remaining data would be the USD hotel contract).
- **But the mismatch may move:** the three Wadi Rum services themselves mix JOD + USD, so if they land
  together on one Wadi Rum supplier, a **new `CURRENCY_MISMATCH` could appear there** unless their own
  JOD/USD mix is resolved. The entrance (JOD → an already-JOD entrance supplier) and the two USD
  operational-assistance services are currency-consistent.
- `UNVERIFIED_HOTEL_CONTRACT` is **unchanged** by any of this.

## 10. Reference safety
Reassigning a service changes only its owning `supplierId`, not the **service ID** — so quote items and
components keep referencing the same service (like the Sun City hotel relink). The heavily-referenced
services (entrance 25 refs, meet & assist 22 refs) would remain intact.

## 11. Risks
- **Wrong target supplier** — reassigning to the wrong home compounds the error; the correct target must
  be confirmed.
- **Moving the mismatch** — the Wadi Rum services' own JOD/USD mix could create a new mismatch at the
  target.
- **Editing currency before fixing attribution** — would price against the wrong supplier context.
- **Touching the hotel contract incorrectly** — the contract is a separate verification item and must
  not be changed here.

## 12–15. Confirmations
- **No data was edited.**
- **No email was sent.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- No raw identifiers (supplier / service / quote IDs), secrets, hosts, URLs, project identifiers,
  session tokens, or connection details are recorded here — only service names, categories, amounts,
  currencies, reference counts, and the recommendation.
