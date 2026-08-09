# ERP V2 — HC-2 Hotel Contract/Rate Summary Drawer: Staging Validation Report

**Result: PASS** (read-only) — the deployed HC-2 proxy returns the exact curated
payload the drawer renders, across roles, with `agent_admin` blocked (HC-1A),
correct 404, and no side effects.

---

## 1. Result

- HC-2 staging validation **passed**.
- Drawer / proxy returns a **curated** hotel contract/rate summary.
- Role / cost gating validated.
- `agent_admin` blocked.
- No side effects.

## 2. Context

- **PR #813.**
- **Frontend proxy:** `GET /api/quotes/:id/v2/items/:itemId/hotel-contract-summary`.
- **Backend endpoint** from HC-1 / PR #809: `GET /quotes/:id/v2/items/:itemId/hotel-contract-summary`.
- **Access hardening** from HC-1A / PR #811.
- Read-only feature.
- No hotel pricing/apply behavior change.

## 3. Staging deployed commits

- **admin-web includes PR #813:** the `git-main` alias serves the deploy created
  22:55:41Z, matching the #813 merge
  **`596b107c4b6cb75313b52900078450f0016e1e0a`** (22:55:36Z).
- **API includes PR #809 and PR #811** (staging API on `596b107c`, the origin/main
  tip that contains both).
- Deployed proxy returned a **curated payload**.
- `agent_admin` **403** confirms HC-1A hardening is live.

## 4. Quote / item used

- **Q-2026-0001 "QA Quote Builder V2"** (`bfee9330-5259-4357-a0fa-e953c6195f93`).
- Existing QA staging quote used **read-only**.
- hotel item: `6111c9ab-d1d7-4b78-8d9a-1f30f381894c`.
- hotel: **QA Test Hotel Amman**.
- city / category: **Amman / 4**.
- contract: **QA Hotel Contract 2026**.
- confidence: **IMPORTED_UNVERIFIED**.
- **No data created.**

## 5. Hotels step / button result

- Drawer data source **live through the HC-2 proxy**.
- "View contract/rate" button logic covered by the merged **7/7** source-grep test.
- Button appears **only when `hotel.pricedQuoteItemId` is set**.
- Ambiguous rows show **no** button.
- **"resolve in Classic" note remains.**
- An authenticated browser drive was **not performed** because login credentials are
  prohibited.

## 6. Drawer open/close result

- Covered by the merged source-grep test.
- `role="dialog"`.
- Close handler present.
- Loading / error / close states present.
- Data path validated through the deployed proxy.

## 7. Network / proxy result

- Deployed proxy `GET /api/quotes/:id/v2/items/:itemId/hotel-contract-summary`
  returned **200**.
- Payload is **curated**.
- Confirms the safe `/hotel-contract-summary` backend route.
- **No raw hotel/contract/rate endpoint called.**
- **No pricing/apply endpoint called by the drawer.**

## 8. Fields rendered

- hotel name
- city
- category
- preferenceRank
- contract status
- contract name
- validFrom / validTo
- currency
- confidence
- lastVerifiedAt
- room category
- mealPlan
- occupancyType
- seasonName
- hasCancellationPolicy
- hasChildPolicy
- supplementsCount
- mealPlanCodes
- warnings

## 9. Cost behavior

- admin cost present with **exactly**: `baseCost`, `costBaseAmount`, `costCurrency`,
  `salesTaxPercent`, `serviceChargePercent`, `tourismFeeAmount`, `tourismFeeCurrency`.
- finance cost present.
- viewer cost omitted.
- operations cost omitted.
- No null/zero placeholder.
- No supplier cost/rate money when cost is absent.

## 10. Agent_admin result

- `agent_admin` received **403** through the deployed proxy.
- `hasSummary: false`.
- No drawer payload returned.
- HC-1A hardening holds **end-to-end**.

## 11. Redaction / UI safety audit

Response does **not** include:

- `snapshotJson`
- raw JSON
- `ratePolicies`
- `verificationNotes`
- supplements array
- passengers / PII
- contact / `contactId`
- company internals
- `publicToken`
- `quoteItems`
- `workflowDiagnostics`
- booking
- invoice
- `auditLog`
- `baseCost` at top level (money only inside the `cost` block)

The drawer renders only whitelisted fields.

## 12. Action safety audit

The drawer has no:

- edit contract/rate action
- apply/reprice action
- send action
- Accept action
- invoice action
- booking action
- lifecycle action

## 13. Error-state result

- Missing itemId through the deployed proxy returned **404**.
- Drawer non-blocking error path covered.
- No data created.

## 14. Side-effect check

- **Q-2026-0001 unchanged.**
- status **ACCEPTED** unchanged.
- totals **552 / 500** unchanged.
- `acceptedVersionId` unchanged.
- invoice unchanged / no new invoice.
- bookings count **1** unchanged.
- versions unchanged.
- All calls **GET / read-only**.
- No writes.
- No email/send.
- No Accept.
- No hotel pricing/apply change.

## 15. Confirmations

- No data edits.
- No cleanup needed.
- No Accept.
- No invoice.
- No booking.
- No email/send.
- Production unchanged.
- Voucher-send allowlist remains **`ziad@axisdmc.com` only**.
- Supplier sending **disabled**.
- Next build slice **not started**.

## 16. GO / NO-GO

**GO**

- HC-2 validated on staging.
- Close Hotel Contract/Rate read-only detail after this doc is merged.

**NO-GO**

- Hotel contract/rate edits.
- Catalog / supplier CRUD.
- Hotel create/apply expansion.
- Exposing supplier cost/rates to non-finance roles.
- Accept / invoice / booking.
- Staff rollout / live bookings.
- Supplier send / voucher-send.
- Full no-Classic launch.

---

*Validation performed on staging only, read-only, via the deployed admin-web HC-2
proxy (the exact data source the drawer renders), against an existing QA hotel-bearing
quote. No data created or edited. The visual drawer rendering + button gating are
covered by the merged source-grep test + tsc; a real browser drive of the
authenticated staging page was not performed (it requires login credentials). Classic
remains the system of record.*
