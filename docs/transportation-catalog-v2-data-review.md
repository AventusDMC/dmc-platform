# Transportation Catalog V2 / Transport Data Review

**Date:** 2026-07-13
**Status:** Read-only review. No code, schema, flag, environment, or **data** change accompanies this
report. **No data was edited.**

A read-only review of the remaining transport suppliers, their contracts, vehicle rates, currencies,
and warnings — to establish what is clean, what is artifact, and what needs pricing-owner review
before any Transport Catalog V2 work or data edits.

---

## 1. Scope
Read-only review only (Catalog V2 summary + read-only queries on transport contracts and vehicle
rates). No supplier / service / rate / contract / currency row was created, updated, deleted, or
deactivated.

## 2. Remaining transport suppliers
After the General Transport deletion, three transport suppliers remain:

| Supplier | email | baseCity | services | contracts | vehicle rates | currencies | warnings |
|---|---|---|---|---|---|---|---|
| Almushtari Logistics Services | set | Amman | 9 | 5 | 236 | JOD | none |
| Alpha Bus and Limo Co | set | Amman | 7 | 12 | 496 | JOD, USD | CURRENCY_MISMATCH |
| Desert Compass Transport | set | Amman | 2 | 2 | 0 | JOD, USD | MISSING_RATES, CURRENCY_MISMATCH |

## 3. Almushtari Logistics Services — CLEAN
- **Clean**, no warnings; single currency **JOD**.
- **5 active ROUTE_TRANSFER contracts** (one per class: Mini Van, Sedan, Small Mini Bus, SUV, Van), all
  valid.
- **236 vehicle rates, all JOD, all active, none expired**, across 56 routes × 5 classes.
- **Optional coverage gap:** Small Mini Bus has only 4 rates (vs ~55–59 for other classes) — a possible
  coverage fill, not a warning.
- Usable for quoting.

## 4. Alpha Bus and Limo Co — priced operation is USD; JOD mismatch is legacy contracts
- **The actual priced operation is USD:** all **496 vehicle rates are USD** (active, none expired,
  62 routes × 5 classes), and the **package (daily) rates are USD** (Large Bus full/half 656/370,
  Medium Bus 525/307, via PACKAGE_MIN_FULL_DAY contracts).
- **The JOD mismatch comes from 6 legacy no-validity-window ROUTE_TRANSFER contracts that carry zero
  vehicle rates** — leftover/superseded rows that add JOD to the currency set without any pricing.
- **This corrects the earlier "intentional dual currency" assumption** (Batch 3): the live data shows
  no JOD vehicle rates at all — the operation is single-currency USD, and the CURRENCY_MISMATCH is a
  legacy-contract artifact, not a JOD-small-vehicle / USD-coach split.

## 5. Desert Compass Transport — HOLD
- **HOLD** — effectively non-functional for transport quoting:
  - **Zero vehicle rates** (so nothing can be priced) → MISSING_RATES is real.
  - **Unpriced transfer service** ("Jordan Private Transfer Service", baseCost 0) + a USD meet-and-assist.
  - **Two inactive/empty ROUTE_TRANSFER contracts** (JOD, no validity window, no rates).
  - **JOD / USD mismatch** (JOD contracts vs USD services).
- Pricing-owner decisions needed before it is usable (load rates, price the transfer, resolve currency,
  confirm/retire the no-window contracts).

## 6. Transport contract / rate coverage summary
- **Regimes:** ROUTE_TRANSFER (all three) + PACKAGE_MIN_FULL_DAY (Alpha coaches only).
- **Priced & usable:** Almushtari (236 JOD route rates, 5 classes) and Alpha (496 USD route rates +
  coach packages, 5 classes) — both fully priced, single effective currency each.
- **Unpriced:** Desert Compass (0 rates).
- **Legacy/leftover:** Alpha's 6 JOD no-window ROUTE_TRANSFER contracts (0 rates).
- **Coverage gap:** Almushtari Small Mini Bus (4 rates).
- Contracts have a real `active` soft-deactivation flag, so contract-level cleanup is reversible
  (unlike a supplier hard-delete).

## 7. Warning classifications
| Supplier / item | Classification |
|---|---|
| Almushtari Logistics Services | CLEAN (Small Mini Bus coverage = optional pricing-owner decision) |
| Alpha — USD operation (rates, current contracts, packages) | CLEAN / ACCEPT_AS_IS |
| Alpha — 6 legacy JOD no-window contracts (mismatch driver) | NEEDS_CONTRACT_REVIEW → soft-deactivate if superseded |
| Desert Compass Transport | HOLD / NEEDS_PRICING_OWNER_DECISION + NEEDS_CONTRACT_REVIEW |

## 8. Recommended cleanup order (safest first)
1. **Alpha legacy JOD contracts** — confirm superseded, then possibly **soft-deactivate** (reversible,
   zero pricing impact since they hold no rates); would clear CURRENCY_MISMATCH (4 → 3). Pricing-owner
   sign-off.
2. **Optional Almushtari Small Mini Bus coverage fill** (if the class is offered). Pricing-owner.
3. **Desert Compass Transport — dedicated transport review** (load-rates-and-price vs retire; prefer
   soft-deactivating contracts/services over deletion). Pricing-owner + transport review.
4. **No-change:** Almushtari's JOD operation and Alpha's USD operation.

## 9. Recommended Transport Catalog V2 detail view
A read-only transport detail view is warranted (the catalog summary shows only counts + a currency
*set*, which cannot distinguish "USD-current + JOD-legacy" from genuine dual currency, nor a
contract-with-zero-rates). Suggested content:
- **Supplier profile** (base city, contact, effective currency).
- **Vehicle-rate table** (class × route × pax × price × currency × validity).
- **Contract validity / regime** (ROUTE_TRANSFER vs PACKAGE, per class, package daily rates, no-window
  flag).
- **Currency view** (currency per class/regime — surfaces the Alpha legacy-JOD and Desert Compass
  contract-vs-service splits).
- **Route / regime display.**
- **Missing-rate warnings** (contract-with-zero-rates like Desert Compass; under-covered class like
  Almushtari Small Mini Bus).
Recommend delivering it as a read-only, flag-gated, internal-only detail slice before any transport
pricing edits.

## 10. Risks
- **Deactivating Alpha's legacy JOD contracts without confirmation** — confirm they are truly
  superseded first (they hold zero rates, so it is safe, but get pricing-owner sign-off; use the
  reversible `active=false` flag, not deletion).
- **Desert Compass pricing complexity** — it has services + contracts (not a clean orphan); pricing or
  retiring it needs care and pricing-owner input.
- **Currency edits affecting future quotes** — any rate/currency change affects future quotes (existing
  quotes are frozen snapshots).

## 11. Confirmations
- **No data was edited.**
- **No rates / prices / currencies changed.**
- **No email was sent.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- No raw identifiers (supplier / contract / rate IDs), secrets, hosts, URLs, project identifiers,
  session tokens, or connection details are recorded here — only names, counts, currencies, regimes,
  and warning classifications.
