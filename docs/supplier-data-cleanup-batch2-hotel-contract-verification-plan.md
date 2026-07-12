# Supplier Data Cleanup — Batch 2 (Hotel Contract Verification) Plan

**Date:** 2026-07-12
**Status:** Read-only **planning only**. No code, schema, flag, environment, or **data** change
accompanies this plan. **No hotel contract was verified or edited.**

Batch 2 targets the `UNVERIFIED_HOTEL_CONTRACT` warnings surfaced by Product Catalog V2. Goal: review
and verify hotel contracts safely, without blindly bulk-verifying. Values below are from the live,
read-only Product Catalog V2 summary.

---

## 1. Scope
Read-only planning only. This document lists the unverified contracts, defines the evidence required
before verification, splits candidates from hold items, names the safe edit path for later, and
defines validation. **No data was edited.**

## 2. Current state
**11 of 12 hotel contracts are `IMPORTED_UNVERIFIED`** (machine-parsed on import, never
human-verified). All 11 are currently within their validity window (`active`).

## 3. The one already-verified contract
- **Dead Sea Spa Hotel — "Travel Agent Contracted Rates 2026/27"** (`VERIFIED`). Not part of Batch 2.

## 4. The 11 unverified hotel contracts

| # | Hotel | Contract | validFrom → validTo | Currency |
|---|---|---|---|---|
| 1 | Corp Amman Hotel | TRAVEL AGENT AGREEMENT 2026 | 2026-01-01 → 2026-12-31 | USD |
| 2 | Amman West Hotel | Contractual Agreement of 2026 | 2026-01-01 → 2026-12-31 | USD |
| 3 | Olive Hotel Amman | Rates Agreement 2026 | 2026-01-01 → 2026-12-31 | USD |
| 4 | Crowne Plaza Jordan Dead Sea Resort & Spa | IHG Packaged Leisure Agreement 2026 | 2026-01-05 → 2027-01-04 | JOD |
| 5 | Holiday Inn Resort Dead Sea | IHG Packaged Leisure Agreement 2026 | 2026-01-05 → 2027-01-04 | JOD |
| 6 | Petra Moon Hotel | Contractual Agreement for Petra Moon Hotel 2026 | 2026-01-05 → 2027-01-05 | USD |
| 7 | Amman Rotana | 2026 contract (duplicate USD #1) | 2026-05-28 → 2027-05-28 | USD |
| 8 | Amman Rotana | 2026 contract (duplicate USD #2) | 2026-05-28 → 2027-05-28 | USD |
| 9 | Old Village Resort | Contractual Agreement for the Old Village Hotel & Resort 2026 | 2026-01-07 → 2027-01-06 | USD |
| 10 | Amman Rotana Hotel | 2026 contract (JOD) | 2026-01-01 → 2027-01-02 | JOD |
| 11 | Sun City Camp Wadi Rum | 2026 contract | 2026-01-01 → 2026-12-31 | USD |

Cross-warning notes: Amman West Hotel's supplier also shows `CURRENCY_MISMATCH`; Petra Moon Hotel's
supplier also shows `MISSING_RATES`. (Hotel contracts are keyed to the hotel; the supplier-side row is
matched by name, not linked in this view.)

## 5. The Amman Rotana anomaly
There are **three** Amman Rotana contracts:
- **Two byte-identical USD contracts** (#7 and #8: same name, same 2026-05-28 → 2027-05-28 window,
  same currency) — a probable **duplicate**.
- **One overlapping JOD contract** (#10: "Amman Rotana Hotel", 2026-01-01 → 2027-01-02) — a
  **currency conflict** and an **overlapping validity window** vs the USD pair.

**None of the three Amman Rotana contracts should be verified** until the duplication and the correct
currency are resolved (one or more is likely a deactivate/merge candidate).

## 6. Evidence required before setting `confidence = VERIFIED`
For each contract, confirm the **original signed contract document** matches the stored row on:
- source signed contract present,
- correct hotel / property,
- contract dates (validFrom / validTo = signed term),
- currency (matches the signed contract),
- rate sheet (room categories, seasons, per-night rates),
- child / extra-bed policy,
- meal-plan basis,
- FOC terms (type / ratio / count).

Verify against the source document — not from the imported summary alone.

## 7. Verification candidates (single clean contract per hotel)
Verify against the source doc:
- Corp Amman Hotel
- Olive Hotel Amman
- Crowne Plaza Jordan Dead Sea Resort & Spa
- Holiday Inn Resort Dead Sea
- Old Village Resort
- Sun City Camp Wadi Rum

## 8. Hold / needs review before any verification
- **Amman Rotana contracts** (the three above) — resolve duplicate + currency + overlapping windows first.
- **Amman West Hotel** — supplier `CURRENCY_MISMATCH`; confirm the contract currency before verifying.
- **Petra Moon Hotel** — supplier `MISSING_RATES`; confirm rate rows exist/are correct before
  verifying (a "verified" contract with no rates is worse than an honest unverified one).

## 9. Safe edit path (if later approved)
- Use the dedicated **`PATCH /hotel-contract-health/contracts/:id/confidence`** endpoint with body
  `{ status: 'VERIFIED', verifiedBy: '<operator>', notes: '<evidence ref>' }`. It is the controller's
  only contract mutation, it records `verifiedBy` (attribution), and it is pricing-inert (quotes and
  bookings reference frozen rate rows and booking snapshots, not live confidence).
- Preferred surface: the Classic **Correction Workspace** (`/hotel-contracts/[id]/correction`) under a
  **named operator**, which calls the same endpoint.
- **Do not** use the generic `PATCH /hotel-contracts/:id` — it does not accept `confidence`.

## 10. Validation after edits
- Re-fetch Product Catalog V2 `warningCounts` (read-only) before/after.
- `UNVERIFIED_HOTEL_CONTRACT` drops **only by the number of contracts verified**, and only for those.
- **No rates / prices / currencies changed** — confidence is pricing-inert; confirm `MISSING_RATES`,
  `CURRENCY_MISMATCH`, and non-hotel counts unchanged.
- **No supplier email sent** (confidence update has no mail path).
- **Voucher-send allowlist remains `ziad@axisdmc.com` only**; supplier sending remains disabled.

## 11. Recommended split
- **Batch 2A — review only (no edits):** collect source contract docs; resolve the Amman Rotana
  duplicate + currency; cross-check Petra Moon rates and Amman West currency; produce a per-contract
  verify / hold decision list. Zero data changes.
- **Batch 2B — mark verified after human approval:** verify **only** the approved subset via the
  confidence endpoint (preferably the Classic Correction Workspace under a named operator), **one
  contract at a time**, re-checking `warningCounts` after each. **Do not bulk-verify.** Start with the
  six clean single-contract candidates; hold the Amman Rotana trio, Amman West, and Petra Moon until
  Batch 2A resolves them.

## 12. No data was edited
This plan is analysis only. The Product Catalog V2 summary was read via a read-only GET; **no hotel
contract confidence, rate, currency, date, or any other field was created, updated, or deleted.** No
flags, environment, production, supplier-send, or Classic changes were made. The voucher-send allowlist
remains `ziad@axisdmc.com` and supplier sending remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- Read-only inspection used a session secret pulled into a temporary file that was deleted
  immediately; no secrets, hosts, URLs, project identifiers, session tokens, or connection details are
  recorded here.
