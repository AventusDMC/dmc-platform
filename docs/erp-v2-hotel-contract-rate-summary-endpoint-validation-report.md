# ERP V2 — HC-1 Hotel Contract/Rate Summary Endpoint: Staging Validation Report

**Result: PASS** (read-only) — the endpoint returns a curated, cost-gated, redacted
summary across roles, with correct 404s and no side effects. One transparent
access-control finding on `agent_admin` (money remains protected) is documented
below.

---

## 1. Result

PASS. Read-only staging validation passed: the endpoint returns a curated,
cost-gated, redacted summary; missing / cross-quote / non-hotel all 404; no side
effects.

## 2. Context

- **PR #809.**
- **Endpoint:** `GET /quotes/:id/v2/items/:itemId/hotel-contract-summary`.
- Backend only.
- Read-only.
- No pricing / apply change.

## 3. Staging targeting

- **Project-ID-pinned Railway targeting:**
  `railway ssh -p 26e31130-a684-448a-bb96-f0da7a0a60c9 -s dmc-platform -e production`.
- **Hard-fail identity guard** passed before any DB/read action:
  - project = `dmc-platform-staging`
  - DB fingerprint = `ab62050c502b`
  - production project (`60d81051-…` / `cheerful-enthusiasm`) **not** targeted
- All calls **GET / read-only**. Secrets stayed in-container.

## 4. Deployed commit

- Staging API container `RAILWAY_GIT_COMMIT_SHA = 95aa15f82f4d` — the `origin/main`
  tip, which contains PR #809:
  **`95aa15f82f4dd204c1192d826b49aec333244bc2`**.

## 5. Quote / item used

- **No `UAT-STAGING`-titled hotel quote existed.**
- Used an existing QA staging quote **read-only**:
  **Q-2026-0001 "QA Quote Builder V2"** (`bfee9330-5259-4357-a0fa-e953c6195f93`).
- hotel item: `6111c9ab-d1d7-4b78-8d9a-1f30f381894c`.
- hotel: **QA Test Hotel Amman**.
- city / category: **Amman / 4**.
- contract: **QA Hotel Contract 2026**.
- confidence: **IMPORTED_UNVERIFIED**.
- `contractId` and `roomCategoryId` present.
- **No data was created.**

## 6. Admin summary result

- **200.**
- Curated top-level shape present (all expected keys).
- `contract.status = contracted`.
- `validFrom` / `validTo` / `currency` / `confidence` present.
- room: **Standard Room / HB / DBL / QA Season**.
- policies: no cancellation/child, `supplementsCount 0`, `mealPlanCodes []`.
- warnings: **UNVERIFIED_HOTEL_CONTRACT**.
- `cost` present with **exactly the 7 curated keys**.

## 7. Viewer summary result

- **200.**
- `cost` omitted entirely.
- No null/zero placeholder.
- No money leak.
- contract / room / policy fields present.

## 8. Operations summary result

- **200.**
- `cost` omitted entirely.
- No supplier cost/rate exposed.

## 9. Finance summary result

- **200.**
- `cost` present with the 7 curated keys.
- Live-validated, not fallback.

## 10. Restricted role result

- `agent` → **403**.
- `agent_admin` → **200** — **finding:**
  - The platform RolesGuard **coalesces `agent_admin` → `admin`**, so it satisfies
    the route `@Roles`.
  - **`cost` is still omitted** because `canActorViewCost` excludes `agent_admin`.
  - **Supplier cost remains protected** (verified `costPresent: false` for
    `agent_admin`).
  - This is **pre-existing guard behavior, not introduced by HC-1**.
  - **Recommend a follow-up explicit route-level allowlist / hardening (HC-1A)**
    before HC-2 **if strict `agent_admin` exclusion is required**.

## 11. Unauthorized result

- No auth → **401**.

## 12. Missing / cross-quote / non-hotel result

- Missing itemId → **404**.
- Cross-quote item → **404**.
- Non-hotel item → **404**.

## 13. Redaction audit

Response does **not** include:

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

## 14. Warning behavior

- Warnings are safe **code-only** values.
- `UNVERIFIED_HOTEL_CONTRACT` returned.
- No internal notes exposed.

## 15. Side-effect check

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

## 16. Confirmations

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

## 17. GO / NO-GO

**GO**

- HC-1 endpoint validated as read-only and cost-safe.
- Document the `agent_admin` route-access finding.
- Plan a tiny **HC-1A** hardening slice if strict `agent_admin` exclusion is
  required.

**NO-GO**

- HC-2 frontend drawer until the access-control finding is either accepted or
  hardened.
- Hotel contract/rate edits.
- Catalog / supplier CRUD.
- Exposing supplier cost/rates to non-finance roles.
- Accept / invoice / booking.
- Staff rollout / live bookings.
- Supplier send / voucher-send.
- Full no-Classic launch.

---

*Validation performed on staging only, read-only, against an existing QA hotel-bearing
quote. No data created or edited. The `agent_admin` finding reflects platform-wide
RolesGuard coalescing; supplier cost is still redacted for it. Classic remains the
system of record.*
