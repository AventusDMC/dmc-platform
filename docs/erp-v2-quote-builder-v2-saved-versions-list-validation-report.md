# Quote Builder V2 — VV-3 Slice 1 Saved Versions List: Staging Validation Report

**Result: PASS** — the deployed admin-web LIST proxy returns a metadata-only saved
versions list, the empty state and refresh-after-save behave correctly, and nothing
mutates lifecycle or financials.

---

## 1. Result

PASS. The read-only "Saved versions" list works end-to-end on staging using the
metadata-only list route — no raw detail endpoint, no `snapshotJson`, no cost/PII.

## 2. Context

- **PR #800** — read-only saved versions list in Quote Builder V2.
- **Metadata-only list** (`versionNumber` / `label` / `createdAt`).
- **No raw detail endpoint** (`/versions/:versionId`) is used.

## 3. Staging targeting

- **Project-ID-pinned Railway targeting:**
  `railway ssh -p 26e31130-a684-448a-bb96-f0da7a0a60c9 -s dmc-platform -e production`.
  No bare service-name targeting.
- **Hard-fail identity guard** ran in-container before any DB access and passed:
  - project = `dmc-platform-staging`
  - project id = `26e31130-a684-448a-bb96-f0da7a0a60c9`
  - DB fingerprint = `ab62050c502b` (staging match)
  - production project (`60d81051-…` / `cheerful-enthusiasm`) **not** targeted
- Production was probed **read-only** (single flag read; no DB access, no write).
  Secrets stayed in-container.

## 4. Deployed commit

- **admin-web includes PR #800:** merge commit
  `e2def746508daaacfced92bb6265ce6b88d8b72f` is the `origin/main` tip; Vercel
  `admin-web-staging` `git-main` production deploy created 11:07:52Z, matching the
  #800 merge (11:07:48Z). The staging API is on the same commit and serves the
  hardened list route the proxy forwards to.

## 5. Quote references

- **Q-2026-0004** — `b89bfcf7-99ec-4f77-8da6-e724e37dbad1`, DRAFT, with one saved
  VV-1 version.
- **UAT-STAGING-QBV3-SAVED-VERSIONS-LIST — DO NOT SEND** —
  `d16adad0-a66b-4310-b0a0-5e17160626d0`, created and deleted this run.

## 6. List / proxy result

- Deployed admin-web-staging proxy `GET /api/quotes/:id/versions` (dmc_session
  cookie) for Q-2026-0004 → **200**.
- **Metadata keys only:** `id`, `quoteId`, `versionNumber`, `label`, `createdAt`.
- **No `snapshotJson`.**
- **No cost / margin / PII / internal notes** (forbidden-key audit empty across all
  rows).

## 7. Frontend rendered result

- Saved versions region rendered (from the proxy payload — the exact data source).
- **Version 1** displayed.
- **label** displayed ("VV-1 staging synthetic validation").
- **createdAt / date** displayed.
- **No lifecycle actions** (rendering pinned by the merged source-grep test + tsc).

## 8. Empty state

- Zero-version synthetic quote → deployed proxy returned **`[]`**.
- Maps to **"No saved versions yet."**

## 9. Refresh-after-save

- `POST /quotes/:id/versions` returned **201** (versionNumber 1).
- List re-fetch returned **count 1**.
- **New label** displayed ("VV-3 list validation").
- **No lifecycle / financial side effects.**

## 10. Safety checks

- Raw detail endpoint **not called** — only the LIST proxy was used.
- `snapshotJson` **not rendered**.
- cost / margin / PII **not rendered**.
- **No restore / rollback / set-accepted / send** actions.

## 11. Side-effect checks

- **Q-2026-0004 unchanged.**
- Status unchanged (DRAFT).
- Totals unchanged.
- `acceptedVersionId` null.
- No invoice.
- No booking.
- No email/send.

## 12. Cleanup

- **Synthetic quote deleted.**
- **Cascade removed its version.**
- **Q-2026-0004 left unchanged** (its VV-1 version intact).
- **No production cleanup.**

## 13. Confirmations

- No Accept.
- No invoice.
- No booking.
- No email/send.
- Production unchanged (read-only flag probe only; no prod DB access/writes; no prod
  flag/env changes).
- Production item-create remains **OFF** (`QUOTE_ITEM_CREATE` unset in
  `cheerful-enthusiasm`).
- Voucher-send allowlist remains **`ziad@axisdmc.com` only**.
- Supplier sending **disabled**.

## 14. GO / NO-GO

**GO**

- VV-3 Slice 1 validated on staging.
- Continue ERP build-mode hardening.

**NO-GO**

- Raw `snapshotJson` detail.
- Accept.
- Invoice creation.
- Booking conversion.
- Staff rollout.
- Live bookings.
- Supplier send.
- Full no-Classic launch.

---

*Validation performed on staging only, against clearly-labeled synthetic quotes,
read-mostly with a single guarded synthetic quote + version (both deleted at the
end). Classic remains the system of record.*
