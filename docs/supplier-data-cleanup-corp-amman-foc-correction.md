# Supplier Data Cleanup — Corp Amman FOC Correction Report

**Date:** 2026-07-12
**Status:** Corrected. Documentation only — no code, schema, flag, or environment change accompanies
this report, and no further data edits were made. The contract was **not** marked VERIFIED.

A single, approved data correction: set the group FOC (free-of-charge) policy on the Corp Amman Hotel
contract to match the signed source document. Only the three approved FOC fields were changed; nothing
else on the contract was touched.

---

## 1. Outcome
The Corp Amman Hotel contract FOC was corrected successfully.

## 2. Target contract
**Corp Amman Hotel — "TRAVEL AGENT AGREEMENT 2026".** Identity was confirmed (hotel name) before
editing.

## 3. Before
- `focType = none`
- `focRatio = null`
- `focCount = null`
- `focRoomType = null`

## 4. Edit applied
- `focType = ratio`
- `focRatio = 15`
- `focRoomType = double`

## 5. Fields sent
**Only those three FOC fields** were sent in the PATCH body. No unrelated fields were included.

## 6. Result
The PATCH returned **200**.

## 7. After
- `focType = ratio`
- `focRatio = 15`
- `focRoomType = double`
- `focCount` remains `null` (correct for a ratio-type FOC)

## 8. Confirmed unchanged
- Rates count: **16 → 16**
- Meal plans: unchanged (BB / HB; `hasMealPlans` remained true)
- Child policy: unchanged (`hasChildPolicy` remained true)
- Currency: **USD**, unchanged
- Validity dates: **2026-01-01 → 2026-12-31**, unchanged
- Product Catalog V2 `warningCounts`: **unchanged** (FOC is not a warning trigger;
  `UNVERIFIED_HOTEL_CONTRACT` remained 11)

## 9. Not verified
The contract was **not** marked VERIFIED.

## 10. Confidence
Remains `IMPORTED_UNVERIFIED`.

## 11. verifiedBy
Remains `null`.

## 12. No other fields edited
No rates, prices, currencies, validity dates, meal plans, child policy, or supplier fields were
edited. Only the three FOC fields above changed.

## 13. No email sent
The edit is a pure contract field write with no mail path. No email was sent.

## 14. Voucher-send allowlist
Unchanged — remains `ziad@axisdmc.com` only.

## 15. Supplier sending
Remains disabled.

## 16. Edit path and audit note (honest)
The edit was applied through an authenticated maintenance/admin session using the hotel contract
update (PATCH) path that accepts FOC fields — a partial update that changed only the FOC scalars and
left all other contract data (rates, meal plans, child policy, supplements, currency, dates,
confidence) untouched. The hotel-contract PATCH path may **not** write an explicit audit row, so these
edits likely did not produce an audit-log entry. If a named-user audit trail is required, the same FOC
correction can be re-applied through the Classic UI under a named user.

## Pricing note
FOC feeds **future** quote pricing when a quote's own FOC is unset, so this correction is
pricing-relevant going forward. Existing quotes are frozen snapshots and are unaffected.

### Safety confirmations
- Documentation only — no code, schema, flag, or environment change in this report.
- No additional data edits were made while producing this document.
- No Classic code changes; no supplier packet / send / allowlist changes.
- Read-only verification used a session secret pulled into a temporary file that was deleted
  immediately; no secrets, hosts, URLs, project identifiers, session tokens, or connection details are
  recorded here.
