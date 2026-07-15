# Supplier Data Cleanup — Amman West Target-Supplier Mapping Preflight

**Date:** 2026-07-15
**Status:** Read-only preflight. No code, schema, flag, environment, or **data** change accompanies
this report. **No data was edited.**

Maps the 6 misattributed Amman West services to their likely correct target suppliers before any
reassignment.

---

## 1. Scope
Read-only preflight only. Values were read via read-only queries. No service / supplier / currency row
was created, updated, deleted, or reassigned; no new supplier was created.

## 2. The mismatch is caused by six linked non-hotel services
Amman West Hotel's `CURRENCY_MISMATCH` is caused by **six linked services that are not hotel products**,
mixing JOD + USD.

## 3. The actual hotel contract is single-currency USD
Amman West's own hotel inventory is a single contract in **USD** (single currency) — not the source of
the mismatch.

## 4. The six services reviewed
| Service | currency |
|---|---|
| St. George Church / Mosaic Map Entrance | JOD |
| Wadi Rum Excursion - 2 Hours | JOD |
| Wadi Rum Sunset Jeep Tour | JOD |
| Queen Alia Airport Meet & Assist | USD |
| Wadi Araba Border Assistance | USD |
| Wadi Rum Jeep Tour | USD |

## 5. Clean candidate
- **St. George Church / Mosaic Map Entrance → Jordan Entrance Fees**
  - **High confidence** — it is a Madaba entrance fee, and Jordan Entrance Fees is the entrance-fee
    supplier.
  - **JOD → JOD** (Jordan Entrance Fees is JOD-only) ⇒ **no new mismatch** at the target.
  - Currency/value stay as-is.
  - **Service references remain safe** because reassigning changes only the owning `supplierId`, not
    the **service ID** — quote items/components keep referencing the same service.
  - Classification: **APPROVE_REASSIGN** (pending Ziad's explicit approval of the exact reassignment).

## 6. HOLD items
- **The three Wadi Rum services** (Excursion 2h, Sunset Jeep Tour, Jeep Tour) — **no dedicated Wadi Rum
  supplier exists**, and the three themselves mix JOD + USD. They need a **target-supplier decision**
  (possibly a new "Wadi Rum Activities" supplier) **and** a **currency decision** for their own JOD/USD
  mix. **HOLD / NEEDS_PRICING_OWNER_CONFIRMATION.**
- **Queen Alia Airport Meet & Assist + Wadi Araba Border Assistance** (both USD) — **no dedicated
  meet-&-assist / operational-assistance supplier exists**. A USD-capable operational/transport supplier
  could host them (assigning to an already-USD supplier avoids a new mismatch; assigning to a JOD-only
  supplier would create one), or a new supplier could be created. **NEEDS_PRICING_OWNER_CONFIRMATION.**

## 7. Warning impact
- **St. George alone will not clear Amman West's `CURRENCY_MISMATCH`** — the other five services still
  mix JOD + USD.
- **Amman West clears only if all six services are reassigned away** (its remaining data would be the
  USD hotel contract).
- **The Wadi Rum services may move the mismatch** to their target supplier unless their own JOD/USD
  issue is resolved — so the net count may be unchanged (mismatch relocated, not removed) unless the
  currency is normalized.
- `UNVERIFIED_HOTEL_CONTRACT` is unchanged by any of this.

## 8. Risks
- **Wrong target supplier** — reassigning to the wrong home compounds the error.
- **Moving the mismatch instead of clearing it** — the Wadi Rum trio's JOD/USD mix and the USD
  operational services could re-create a mismatch at their target.
- **Editing currency before attribution is fixed** — values may be correct for the real supplier;
  don't touch currency first.
- **Touching the Amman West hotel contract incorrectly** — the contract is a separate held item and
  must not be changed here.

## 9–12. Confirmations
- **No data was edited.**
- **No email was sent.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- No raw identifiers (supplier / service / quote IDs), secrets, hosts, URLs, project identifiers,
  session tokens, or connection details are recorded here — only service names, currencies, target
  suppliers, and the recommendation.
