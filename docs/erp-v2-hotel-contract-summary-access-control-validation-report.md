# ERP V2 — HC-1A Hotel Contract Summary Access-Control Hardening: Staging Validation Report

**Result: PASS** (read-only) — HC-1A access-control hardening is validated on staging:
`agent_admin` is now **403** (it was **200** during HC-1 validation and is no longer
200), while the safe HC-1 endpoint behavior is preserved and nothing was mutated.

---

## 1. Result

- HC-1A access-control hardening **validated on staging**.
- `agent_admin` is now **403**.
- `agent_admin` was **200** during HC-1 validation and is **no longer 200**.
- Safe HC-1 behavior preserved.
- No side effects.

## 2. Context

- **PR #811.**
- **Endpoint:** `GET /quotes/:id/v2/items/:itemId/hotel-contract-summary`.
- HC-1A added **explicit allowlist hardening**.
- Goal was to **block `agent_admin` despite RolesGuard coalescing**.
- **HC-2 was held** until this finding was resolved.

## 3. Staging targeting

- **Project-ID-pinned Railway targeting:**
  `railway ssh -p 26e31130-a684-448a-bb96-f0da7a0a60c9 -s dmc-platform -e production`.
- **Hard-fail identity guard** passed before any DB/read action:
  - project = `dmc-platform-staging`
  - DB fingerprint = `ab62050c502b`
  - production project (`60d81051-…` / `cheerful-enthusiasm`) **not** targeted
- All calls **GET / read-only**. Secrets stayed in-container.

## 4. Deployed commit

- Staging API container `RAILWAY_GIT_COMMIT_SHA = 9fcce458c0b2` — the `origin/main`
  tip, which contains PR #811:
  **`9fcce458c0b2c61300efaf52f07518c830f6bd77`**.

## 5. Quote / item used

- **Q-2026-0001 "QA Quote Builder V2"** (`bfee9330-5259-4357-a0fa-e953c6195f93`).
- Existing QA staging quote used **read-only**.
- hotel item: `6111c9ab-d1d7-4b78-8d9a-1f30f381894c`.
- hotel: **QA Test Hotel Amman**.
- city / category: **Amman / 4**.
- contract: **QA Hotel Contract 2026**.
- confidence: **IMPORTED_UNVERIFIED**.
- **No data created.**

## 6. Allowed-role results

- admin → **200**.
- viewer → **200** with cost omitted.
- operations → **200** with cost omitted.
- finance → **200** with cost present.
- Curated summary still returned.
- Warnings included **UNVERIFIED_HOTEL_CONTRACT**.

## 7. Cost behavior

- admin / finance: cost block present.
- viewer / operations: cost omitted entirely.
- No null/zero placeholder.
- No supplier cost/rate exposed to non-finance roles.
- **Cost-gating unchanged from HC-1.**

## 8. Restricted-role results

- agent → **403**.
- agent_admin → **403**.
- agent_admin **no longer 200**.
- Explicit allowlist blocks `agent_admin` **despite RolesGuard coalescing**.
- Live response confirms **no summary data returned**.
- Automated HC-1A test confirms **blocked before `findOne` / quote loading** (the
  service is never called for `agent_admin`/`agent`).

## 9. Unauthorized result

- No auth → **401**.

## 10. Regression behavior

- Missing itemId → **404**.
- Cross-quote item → **404**.
- Non-hotel item → **404**.

## 11. Redaction audit

Allowed-role response does **not** include:

- `ratePolicies`
- `verificationNotes`
- supplements array
- supplier contact
- PII
- `contactId`
- `publicToken`
- `quoteItems`
- `workflowDiagnostics`
- booking
- invoice
- `baseCost` at top level (money only inside the `cost` block)

## 12. Side-effect check

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

## 13. Confirmations

- No data edits.
- No cleanup needed.
- No Accept.
- No invoice.
- No booking.
- No email/send.
- Production unchanged.
- Voucher-send allowlist remains **`ziad@axisdmc.com` only**.
- Supplier sending **disabled**.
- **HC-2 not started.**

## 14. GO / NO-GO

**GO**

- HC-1A access-control finding **resolved**.
- HC-2 frontend "View contract/rate" drawer after this doc is merged.

**NO-GO**

- Hotel contract/rate edits.
- Catalog / supplier CRUD.
- Exposing supplier cost/rates to non-finance roles.
- Accept / invoice / booking.
- Staff rollout / live bookings.
- Supplier send / voucher-send.
- Full no-Classic launch.

---

*Validation performed on staging only, read-only, against an existing QA hotel-bearing
quote. No data created or edited. Classic remains the system of record.*
