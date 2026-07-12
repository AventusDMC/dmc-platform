# Supplier Data Cleanup — Batch 2A (Hotel Contract Verification Review)

**Date:** 2026-07-12
**Status:** Read-only **review only**. No code, schema, flag, environment, or **data** change
accompanies this report. **No hotel contract was marked VERIFIED, and the confidence endpoint was not
called.**

Batch 2A reviewed the 11 `IMPORTED_UNVERIFIED` hotel contracts using their live health-workspace
evidence (rate rows, seasons, supplements, pricing completeness, and the system's own verification
gate) to produce a verify / hold decision list. No verification was performed.

---

## 1. Scope
Read-only review only. Evidence was read from the hotel-contract-health correction-workspace (GET).
The output is a per-contract decision list; no data was changed.

## 2. No verification performed
No hotel contract was marked VERIFIED during this review.

## 3. Confidence endpoint not used
The confidence mutation endpoint was not called. This was analysis only.

## 4. Contracts reviewed
All 11 `IMPORTED_UNVERIFIED` hotel contracts were reviewed.

## Per-contract evidence and decision

| # | Hotel / contract | Cur | Rates | Pricing complete | Season findings | Supplement findings | Health | System gate | Decision |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Corp Amman Hotel | USD | 16 | yes | 0 | 0 | 100 | allowed | APPROVE_FOR_VERIFICATION |
| 2 | Amman West Hotel | USD | 8 | yes | 0 | 1 high | 75 | blocked | HOLD_NEEDS_REVIEW |
| 3 | Olive Hotel Amman | USD | 6 | yes | 0 | 0 | 100 | allowed | APPROVE_FOR_VERIFICATION |
| 4 | Crowne Plaza Dead Sea | JOD | 63 | missing 1 | 3 medium | 0 | 85 | allowed* | HOLD_NEEDS_REVIEW |
| 5 | Holiday Inn Resort Dead Sea | JOD | 63 | missing 1 | 3 medium | 0 | 85 | allowed* | HOLD_NEEDS_REVIEW |
| 6 | Petra Moon Hotel | USD | 28 | yes | 0 | 0 | 100 | allowed | APPROVE_FOR_VERIFICATION |
| 7 | Amman Rotana USD #1 | USD | 0 | no | 0 | 0 | 90 | blocked | DUPLICATE_OR_CONFLICT / MISSING_RATE_DETAIL |
| 8 | Amman Rotana USD #2 | USD | 0 | no | 0 | 0 | 90 | blocked | DUPLICATE_OR_CONFLICT / MISSING_RATE_DETAIL |
| 9 | Old Village Resort | USD | 160 | yes | 0 | 1 high | 75 | blocked | HOLD_NEEDS_REVIEW |
| 10 | Amman Rotana Hotel JOD | JOD | 374 | missing 10 | 3 medium | 2 high | 34 | blocked | DUPLICATE_OR_CONFLICT + HOLD |
| 11 | Sun City Camp Wadi Rum | USD | 52 | missing 2 | 0 | 1 high | 74 | blocked | HOLD_NEEDS_REVIEW |

\* The gate *allows* (a single missing combo + medium season findings do not hard-block), but these
are held pending resolution of those gaps.

## 5. Approved for human source-doc sign-off (verification candidates)
Clean imported data, healthScore 100, fully priced, zero findings, system gate **allowed**:
- **Corp Amman Hotel**
- **Olive Hotel Amman**
- **Petra Moon Hotel**

## 6. Hold / needs review
Blocking findings (supplement conflicts, missing pricing combos, and/or season overlaps):
- **Amman West Hotel** — 1 high-severity supplement conflict (gate blocks); also supplier
  `CURRENCY_MISMATCH`.
- **Crowne Plaza Dead Sea** — 1 missing occupancy/meal-plan combo + 3 medium season findings.
- **Holiday Inn Resort Dead Sea** — 1 missing combo + 3 medium season findings (a separate IHG
  property, not a duplicate of Crowne Plaza).
- **Old Village Resort** — 1 high-severity supplement conflict (gate blocks).
- **Sun City Camp Wadi Rum** — 1 high-severity supplement conflict + 2 missing pricing combos (gate
  blocks).

## 7. Duplicate / conflict hold
- **Amman Rotana USD #1**
- **Amman Rotana USD #2**
- **Amman Rotana Hotel (JOD)**

## 8. Amman Rotana anomaly
- The two USD contracts are **empty duplicate shells** (0 rate rows, 0 room categories, byte-identical;
  the gate blocks with "no rate rows — nothing to verify"). Recommend deactivate/delete one or both.
- The JOD contract is the **populated** one (374 rates, 11 room categories) but with healthScore 34,
  10 missing pricing combos, 2 high-severity supplement conflicts, and 3 season findings.
- **None of the three Amman Rotana contracts should be verified** until the duplication and the
  correct currency (USD vs JOD) are resolved and the JOD contract's findings are cleaned up.

## 9. Petra Moon correction (evidence-based)
The Batch 2 plan tentatively flagged Petra Moon as "hold" because its **supplier** shows
`MISSING_RATES`. The contract-level evidence corrects this: the **Petra Moon hotel contract is fully
priced and clean** (28 rate rows, `pricingComplete = true`, gate allowed, zero findings). The
supplier-level `MISSING_RATES` is a **separate supplier-service gap** (for a later batch), not a
contract defect — so the contract is a valid verification candidate while the supplier-service gap
remains a separate later issue.

## 10. Verification candidates still require human source-doc sign-off
"Approved" here means the imported data is clean and the system gate permits verification — it is
**cleared for human source-doc sign-off**, not auto-verify. This review can see imported rate/season/
supplement/child-policy data and the system findings, but **not the signed source PDFs**. Before
marking any contract VERIFIED, a human must confirm the signed source document, contract dates,
currency, rate sheet, child / extra-bed policy, meal-plan basis, and FOC terms.

## 11. Safe later edit path
- Use the Classic **Correction Workspace** (`/hotel-contracts/[id]/correction`) or the dedicated
  **`PATCH /hotel-contract-health/contracts/:id/confidence`** endpoint, under a **named operator**
  (the endpoint records `verifiedBy` and is pricing-inert).
- **Do not** use the generic `PATCH /hotel-contracts/:id` — it does not accept `confidence`.

## 12. Risks
- **Verifying an empty shell** — the two USD Rotana contracts have 0 rates (gate correctly blocks).
- **Incomplete pricing** — Crowne Plaza / Holiday Inn / Sun City / Rotana-JOD have missing
  occupancy/meal-plan combos; verifying would bless an incomplete rate sheet.
- **Supplement conflicts** — Amman West, Old Village, Sun City, Rotana-JOD have high-severity
  supplement findings (duplicate / HB-included / missing amount).
- **Season overlaps** — Crowne Plaza, Holiday Inn, Rotana-JOD each show 3 medium season findings.
- **Currency conflict** — Rotana exists as two empty USD shells + one populated JOD contract; the
  correct currency and surviving contract must be decided first.
- **Source document not confirmed** — data quality and the gate are green for the three candidates,
  but the signed contract and child/meal/FOC terms still need human confirmation.

## 13. Recommended split
- **Batch 2B — verify only the approved subset** (Corp Amman Hotel, Olive Hotel Amman, Petra Moon
  Hotel), **after human source-doc confirmation**, one contract at a time, re-checking `warningCounts`
  after each (expected UNVERIFIED_HOTEL_CONTRACT 11 → 8 if all three are approved).
- **Hold the rest** — the 5 HOLD contracts (resolve supplement/pricing/season findings first) and the
  3 Rotana contracts (resolve duplicate/currency/empty-shell first).

## 14. No data was edited
This review is analysis only. **No hotel contract confidence, rate, currency, date, supplement, or any
other field was created, updated, or deleted.** No flags, environment, production, supplier-send, or
Classic changes were made. The voucher-send allowlist remains `ziad@axisdmc.com` and supplier sending
remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- Read-only inspection used a session secret pulled into a temporary file that was deleted
  immediately; no secrets, hosts, URLs, project identifiers, session tokens, or connection details are
  recorded here.
