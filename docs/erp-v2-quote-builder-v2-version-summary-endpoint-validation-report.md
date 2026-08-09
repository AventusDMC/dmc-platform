# Quote Builder V2 — VV-3 Slice 2A Safe Version Summary Endpoint: Staging Validation Report

**Result: PASS** — the safe version summary endpoint returns a curated, role-gated,
cost-gated, redacted summary on staging; the guards and 404s behave; nothing was
mutated (all calls were read-only).

---

## 1. Result

PASS. `GET /quotes/:id/versions/:versionId/summary` works end-to-end on staging: it
returns only whitelisted fields, gates cost to finance-visible roles, blocks
restricted/unauthenticated actors, 404s on missing/cross-quote versions, and exposes
no raw snapshot or PII.

## 2. Context

- **PR #803.**
- **Endpoint:** `GET /quotes/:id/versions/:versionId/summary`.
- **Safe curated version summary.**
- **No raw `snapshotJson` returned.**
- **No raw version detail endpoint used by V2.**

## 3. Staging targeting

- **Project-ID-pinned Railway targeting:**
  `railway ssh -p 26e31130-a684-448a-bb96-f0da7a0a60c9 -s dmc-platform -e production`.
  No bare service-name targeting.
- **Hard-fail identity guard** ran in-container before any DB/read action and passed:
  - project = `dmc-platform-staging`
  - project id = `26e31130-a684-448a-bb96-f0da7a0a60c9`
  - DB fingerprint = `ab62050c502b`
  - production project (`60d81051-…` / `cheerful-enthusiasm`) **not** targeted
- Production was probed **read-only** (single flag read; no DB access, no write).
  All validation calls were GET/read-only. Secrets stayed in-container.

## 4. Deployed commit

- Staging API container `RAILWAY_GIT_COMMIT_SHA = 3ae622b21228` — the `origin/main`
  tip, which contains PR #803:
  **`3ae622b21228934dee299f9ada82f9eec08f1568`**.

## 5. Quote / version reference

- **Q-2026-0004** — `b89bfcf7-99ec-4f77-8da6-e724e37dbad1`, DRAFT.
- **versionId:** `1cad90e7-f697-4345-800e-cff71f55e7a0`.
- **versionNumber:** 1.
- **label:** "VV-1 staging synthetic validation".

## 6. List lookup result

- `GET /quotes/:id/versions` → **200**.
- count **1**.
- **Metadata-only keys:** `id`, `quoteId`, `versionNumber`, `label`, `createdAt`.

## 7. Admin summary result

- **200**.
- Expected curated keys all present (`missingExpected: []`).
- `completeness.ok` = **true**.
- `acceptWillSucceed` = **true**.
- **cost present:** `totalCost 160`, `margin 40`, `marginPercent 20`.
- **No per-item cost internals.**

## 8. Viewer summary result

- **200**.
- Client-facing fields present (`totalSell 200`, `pricePerPax 100`).
- **cost omitted entirely.**
- **No null / zero cost placeholder.**

## 9. Finance summary result

- **200**.
- **cost present** with curated cost fields only (`totalCost 160`, `margin 40`,
  `marginPercent 20`).

## 10. Guard results

- operations → **403**.
- no auth → **401**.
- missing version → **404**.
- cross-quote version → **404**.

## 11. Redaction audit

Deep-key scan of the whole response found **none** of:

- `snapshotJson`
- passengers / passport / DOB
- contact / contactId / contact email / phone / name
- company / clientCompany / brandCompany internals
- `note`
- `termsNotesText`
- `workflowDiagnostics`
- `convertBlockers`
- transportSelection internals
- `publicToken`
- agent / agentId
- `booking`
- `invoice`
- `scenarios`
- `revisedFromId`
- `quoteItems`
- per-item cost internals

## 12. Completeness

- Evaluated from the **saved version snapshot** (VV-2 evaluator).
- `completeness.ok` = **true**.
- `completeness.reasons` = **empty**.
- `acceptWillSucceed` equals `completeness.ok`.
- Proposal **not accepted**.

## 13. Side-effect check

- **Q-2026-0004 unchanged.**
- status **DRAFT**.
- totals unchanged (200 / 160).
- `acceptedVersionId` null.
- versions count unchanged (1).
- no invoice.
- 0 bookings.
- All validation calls **GET / read-only**.

## 14. Confirmations

- No data edits.
- No cleanup needed.
- No Accept.
- No invoice.
- No booking.
- No email/send.
- Production unchanged.
- Production item-create remains **OFF** (`QUOTE_ITEM_CREATE` unset in
  `cheerful-enthusiasm`).
- Voucher-send allowlist remains **`ziad@axisdmc.com` only**.
- Supplier sending **disabled**.
- Slice 2B **not started**.

## 15. GO / NO-GO

**GO**

- Slice 2A backend endpoint validated on staging.
- Continue to Slice 2B frontend proxy + drawer after this doc merges.

**NO-GO**

- Raw `snapshotJson` in V2.
- Raw version detail endpoint in V2.
- PII / contact / company / internal notes.
- Cost for viewer / restricted roles.
- Accept / invoice / booking.
- Staff rollout / live bookings.
- Supplier send / voucher-send.
- Full no-Classic launch.

---

*Validation performed on staging only, read-only, against the existing synthetic
Q-2026-0004 and its VV-1 version. No data created or edited. Classic remains the
system of record.*
