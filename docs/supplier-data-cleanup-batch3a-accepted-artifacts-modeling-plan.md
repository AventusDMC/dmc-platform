# Supplier Data Cleanup — Batch 3A: Accepted Artifacts + Modeling Fix Plan

**Date:** 2026-07-13
**Status:** Planning only. No code, schema, flag, environment, or **data** change accompanies this
report. **No data was edited and no code was changed.**

Batch 3A turns the Batch 3 investigation into a clear "accepted artifact vs real cleanup" plan and
defines the engineering fix for the NO_ACTIVE_SERVICES hotel-contract modeling artifact.

---

## 1. Scope
Planning only. No data edits, no code, no PR beyond this document. The engineering fix described below
is a **plan**; implementation would follow the standard flag-gated PR flow after this plan is merged.

## 2. Accepted artifacts (should NOT be edited)
- **Petra Moon Hotel** — MISSING_RATES, priced via `SupplierService.baseCost`.
- **Jordanian Table Catering** — MISSING_RATES, priced via `baseCost`.
- **Desert Compass Guides** — MISSING_RATES, priced via `baseCost`.
- **Jordan Entrance Fees — priced items** — MISSING_RATES, priced via `baseCost` (the 8 zero-cost
  items are separate; see §6).
- **Alpha Bus and Limo Co** — CURRENCY_MISMATCH, intentional dual currency.
- **RateHawk Inventory** — NO_ACTIVE_SERVICES, external inventory integration.
- **Hotel suppliers with hotel contracts but NO_ACTIVE_SERVICES** — a model gap (the supplier-level
  "active" check does not count hotel contracts).

## 3. Why not to edit
- **baseCost-priced suppliers** — the service is already priced via `baseCost`; the catalog's
  `rateRows` figure just doesn't count it. Adding a `serviceRate` row would **double-price** future
  quotes. The warning is cosmetic.
- **Alpha dual currency** — the JOD + USD split is **intentional** (JOD for small vehicles, USD for
  coaches). Collapsing to one currency would mis-price.
- **RateHawk Inventory** — an **external inventory integration** with no local services/contracts by
  design; not a data gap.
- **Hotel suppliers with contracts** — this needs a **model fix, not data edits**; no data change can
  legitimately clear the flag.

## 4. Engineering / modeling fix

**Root cause:** the pure builder computes
`operationallyActive = activeServiceCount > 0 || validContractCount > 0`, where `validContractCount`
counts only **transport** contracts. Hotel contracts arrive as a separate flat array with no supplier
link, so a hotel supplier whose inventory lives entirely in hotel contracts is wrongly flagged
NO_ACTIVE_SERVICES.

**The join already exists (no schema change needed):** `Hotel.supplierId` (a required FK to
`Supplier`) plus `Hotel.resolvedSupplierId`, and `Hotel.contracts` (the hotel's contracts). So each
hotel contract's owning supplier is derivable without any schema change.

**Fix — read-only aggregator / builder only:**
- **Data loader (catalog service):** when selecting hotel contracts, also select the owning hotel's
  `supplierId` and `resolvedSupplierId`, and pass each hotel contract's `supplierId` into the builder
  input (the input already carries the contract's validity window).
- **Pure builder (catalog summary):** for each supplier, compute
  `activeHotelContractCount` = hotel contracts owned by that supplier whose validity is active
  (reusing the existing validity classifier — not expired). Then include it in the operational-activity
  test:
  `operationallyActive = activeServiceCount > 0 || validContractCount > 0 || activeHotelContractCount > 0`.
- **No schema/migration.** No rate/price/currency logic touched — purely an additive, read-only
  derivation from an already-stored validity window. A contract's confidence/verification status is
  irrelevant to "active".
- **Tests:** update the catalog builder tests to cover the three cases in §5.
- **Delivery:** normal flag-gated PR + staging validation (this is a live prod behavior change to the
  internal-only Catalog V2 read model).

## 5. Acceptance criteria
- Hotel suppliers **with an active (non-expired) hotel contract** no longer show NO_ACTIVE_SERVICES
  (the 8 hotel-contract false positives drop the flag).
- Suppliers with **no services and no contracts** still show NO_ACTIVE_SERVICES.
- **General Transport remains flagged** (0 services, 0 contracts).
- **RateHawk behavior is explicitly decided:** recommended = **keep flagged** (no local active
  contract, so the flag is technically correct); optionally add an explicit "external integration"
  exemption if the team prefers it not to appear — decide before building.
- **warningCounts drop only for false positives.**
- **Expected NO_ACTIVE_SERVICES 14 → 6** if only the 8 hotel-contract false positives drop (total
  39 → 31). If RateHawk is also exempted, 14 → 5.
- **No rate/price/currency data changes.**

## 6. Remaining real data cleanup (after artifacts; each pricing-owner-gated, one by one)
- **The House Boutique Suites** — `baseCost 0` (confirm real price or mark on-request).
- **8 zero-cost Jordan Entrance Fees** — free vs unpriced (pricing-owner decision).
- **Desert Compass Experiences** — EUR seed-style row (verify / correct / remove).
- **Amman West Hotel** — genuine JOD / USD mix (decide the hotel's currency; also its held unverified
  contract).
- **Desert Compass Transport (HOLD)** — unpriced service + inactive/empty transport contracts +
  currency; full transport review.
- **General Transport** — deactivation decision (stub; not editing now).
- **4 un-contracted hotels** — Mövenpick Hotels & Resorts – Jordan, Olive Branch Hotel Jerash,
  Grand Hyatt Amman, DoubleTree by Hilton Aqaba — load a contract or retire.

## 7. Recommended next order
1. **First — the engineering modeling fix** (count active hotel contracts toward supplier activity):
   highest count impact (−8), cosmetic-safe, no data risk; clears the biggest false-positive block so
   the remaining warnings are all real. Land via a flag-gated PR + staging validation.
2. **Then — pricing-owner review items one by one** (§6), starting with the lowest-risk / highest-signal
   (the two seed-style currency rows and The House `baseCost 0`), then the entrance-fee zeros, then the
   transport / hotel HOLDs.
3. Deactivation decisions (General Transport, un-contracted hotels) last, after confirming no
   quote/booking references.

## 8. Confirmations
- **No data was edited.**
- **No code was changed.**
- **No flags/env changed.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- No secrets, hosts, URLs, project identifiers, session tokens, supplier IDs, or connection details
  are recorded here.
