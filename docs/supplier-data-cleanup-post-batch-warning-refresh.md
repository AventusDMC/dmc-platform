# Supplier Data Cleanup — Post-Batch Warning Refresh

**Date:** 2026-07-12
**Status:** Read-only refresh. No code, schema, flag, environment, or **data** change accompanies this
report. **No data was edited.**

A read-only snapshot of the Product Catalog V2 warnings after the completed cleanup work, to confirm
the expected reductions and frame the next step.

Completed work reflected here:
- **Batch 1** supplier field edits (base city ×3 + Alpha email normalization)
- **Corp Amman FOC correction** (none → ratio / 15 / double)
- **Batch 2B verification** of Corp Amman Hotel, Olive Hotel Amman, and Petra Moon Hotel

---

## 1. Scope
Read-only refresh via a GET of the Catalog V2 summary. No supplier, contract, rate, currency, or
confidence field was created, updated, or deleted; nothing was marked VERIFIED.

## 2. Current warningCounts

| Code | Count |
|---|---|
| MISSING_EMAIL | 6 |
| MULTIPLE_EMAILS | 0 |
| MISSING_RATES | 6 |
| EXPIRED_CONTRACT | 0 |
| EXPIRING_SOON | 0 |
| UNVERIFIED_HOTEL_CONTRACT | 8 |
| NO_ACTIVE_SERVICES | 14 |
| CURRENCY_MISMATCH | 4 |
| MISSING_BASE_CITY | 1 |
| **Total** | **39** |

(24 suppliers, 12 hotel contracts, 4 of 12 hotel contracts now verified.)

## 3. Baseline comparison

| Milestone | Total | Δ |
|---|---|---|
| Original baseline | 46 | — |
| After Batch 1 | 42 | −4 |
| After Batch 2B | **39** | −3 |

Current total = **39**, exactly as expected. Cumulative −7 = −3 MISSING_BASE_CITY + −1 MULTIPLE_EMAILS
(Batch 1) + −3 UNVERIFIED_HOTEL_CONTRACT (Batch 2B). The Corp Amman FOC correction was pricing
metadata only and correctly moved no warning count.

## 4. Confirmed reductions
- **MISSING_BASE_CITY: 4 → 1** (General Transport was skipped, so 1 remains).
- **MULTIPLE_EMAILS: 1 → 0** (Alpha Bus and Limo Co normalized to a single address).
- **UNVERIFIED_HOTEL_CONTRACT: 11 → 8** (Corp Amman, Olive, Petra Moon verified).

## 5. Confirmed unchanged
- **MISSING_RATES: 6** (Batch 3 not started).
- **CURRENCY_MISMATCH: 4** (Batch 3 not started).
- **MISSING_EMAIL: 6** (post-launch item; supplier send disabled).
- **NO_ACTIVE_SERVICES: 14** (largely the hotel-contract modeling artifact — the supplier-level active
  check ignores hotel contracts).

## 6. Remaining priority warnings
- **High severity:**
  - MISSING_RATES (6) — mostly baseCost-priced services (likely artifacts); The House Boutique Suites
    has `baseCost 0` (real gap) and Desert Compass Transport has empty/inactive transport contracts
    (real gap).
  - MISSING_EMAIL (6) — post-launch (only relevant once supplier send is enabled).
- **Medium severity:**
  - UNVERIFIED_HOTEL_CONTRACT (8) — the held set: Amman Rotana ×3, Amman West, Crowne Plaza,
    Holiday Inn, Old Village, Sun City.
  - NO_ACTIVE_SERVICES (14) — largely the hotel-contract modeling artifact, not 14 empty suppliers.
- **Low severity:** CURRENCY_MISMATCH (4), MISSING_BASE_CITY (1).

## 7. Recommended next cleanup direction
- A **read-only Batch 3 investigation** — inspect the two seed-style currency-mismatch rows (an EUR
  service on Desert Compass Experiences and a JOD service on Amman West Hotel, both with seed-style
  identifiers) and confirm The House Boutique Suites `baseCost 0`. **No edits yet** — pricing-sensitive
  changes require pricing-owner approval, and the baseCost-priced MISSING_RATES suppliers are likely
  artifacts that should be accepted rather than "fixed" (adding rate rows could double-price).

## 8. No data edited
This refresh is a read-only GET. No supplier, contract, rate, currency, or confidence field was
created, updated, or deleted, and nothing was marked VERIFIED.

## 9. Voucher-send allowlist
Remains `ziad@axisdmc.com` only.

## 10. Supplier sending
Remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- Read-only inspection used a session secret pulled into a temporary file that was deleted
  immediately; no secrets, hosts, URLs, project identifiers, session tokens, or connection details are
  recorded here.
