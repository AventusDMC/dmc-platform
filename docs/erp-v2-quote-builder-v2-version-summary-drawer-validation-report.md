# Quote Builder V2 — VV-3 Slice 2B Version Summary Drawer: Staging Validation Report

**Result: PASS** — the deployed admin-web summary proxy returns the exact curated
payload the drawer renders, across roles, with correct 404 and redaction behavior;
nothing was mutated (all calls were read-only).

---

## 1. Result

PASS. The Saved-versions "View" drawer's data path works end-to-end on staging: the
deployed proxy forwards to the safe `/summary` endpoint, returns a curated payload
(no raw snapshot), gates cost to finance-visible roles, and 404s on a missing
version.

## 2. Context

- **PR #805** — frontend Version Summary Drawer.
- **Safe proxy:** `GET /api/quotes/:id/versions/:versionId/summary`.
- **Backend summary endpoint** from PR #803.
- **Raw detail endpoint not used** (`GET /quotes/:id/versions/:versionId`).

## 3. Staging deployed commits

- **admin-web includes PR #805:** the `git-main` alias serves the deploy created
  13:17:55Z, matching the #805 merge
  `9024f18b60d067c0eec25f4e17a17dde9b5637c7` (13:17:51Z). The #805 build was waited
  to Ready and the alias confirmed before validating.
- **API includes PR #803:** staging API container on `9024f18b60d0`; the deployed
  proxy returned a 200 curated payload, confirming `/summary` is live.

## 4. Quote / version used

- **Q-2026-0004** — `b89bfcf7-99ec-4f77-8da6-e724e37dbad1`, DRAFT.
- **versionId:** `1cad90e7-f697-4345-800e-cff71f55e7a0`.
- **versionNumber:** 1.
- **label:** "VV-1 staging synthetic validation".

## 5. Saved versions list result

- Metadata list `GET /api/quotes/:id/versions` → **200**.
- count **1**.
- version number, label, `createdAt` present.
- **View button available** through the merged UI (rendering covered by the merged
  source-grep test).

## 6. Drawer / proxy result

- Deployed proxy `GET /api/quotes/:id/versions/:versionId/summary` → **200**.
- Payload is the **curated summary shape**.
- Confirms the proxy uses **`/summary`**.
- Raw `/versions/:versionId` detail route **not used** (the curated shape carries no
  raw snapshot).

## 7. Fields rendered

- version number
- label
- saved date
- quote title
- quote number
- status at snapshot
- travel start / valid until
- nights / rooms / adults / children
- currency
- `totalSell`
- `pricePerPax`
- `itemCount`
- `dayCount`
- `hasInclusions` / `hasExclusions`
- completeness
- `acceptWillSucceed`

## 8. Cost behavior

- **admin cost block present:** `totalCost 160`, `margin 40`, `marginPercent 20`.
- **viewer cost omitted entirely.**
- **No null / zero cost placeholders.**
- **No per-item cost internals.**

## 9. Redaction / UI safety

Deep-key scan of the response found **none** of:

- `snapshotJson`
- raw JSON
- passengers / passport / DOB
- contact / contactId / contact email / phone / name
- company / clientCompany / brandCompany
- `note` / `termsNotesText`
- `workflowDiagnostics` / `convertBlockers`
- transportSelection internals
- `publicToken`
- agent / agentId
- `booking`
- `invoice`
- `scenarios`
- `revisedFromId`
- `quoteItems`
- per-item cost

The drawer renders only whitelisted fields and exposes **no restore / rollback /
set-accepted / send** actions (merged source-grep test).

## 10. Error state

- Missing versionId through the deployed proxy → **404**.
- The drawer's non-blocking error path is covered (read-only; no data created).

## 11. Side-effect check

- **Q-2026-0004 unchanged.**
- status **DRAFT**.
- totals unchanged (200 / 160).
- `acceptedVersionId` null.
- versions count **1**.
- no invoice.
- 0 bookings.
- All validation calls **GET / read-only**.
- no email/send.
- no Accept.
- no booking conversion.

## 12. Confirmations

- No data edits.
- No cleanup needed.
- No Accept.
- No invoice.
- No booking.
- No email/send.
- Production unchanged (no production access this task).
- Voucher-send allowlist remains **`ziad@axisdmc.com` only**.
- Supplier sending **disabled**.

## 13. GO / NO-GO

**GO**

- VV-3 Slice 2B validated on staging.
- Close VV-3 Slice 2 after this doc merges.

**NO-GO**

- Raw `snapshotJson` in V2.
- Raw version detail endpoint in V2.
- PII / contact / company / internal notes.
- Cost for viewer / restricted roles.
- Restore / rollback / set-accepted / send.
- Accept / invoice / booking.
- Staff rollout / live bookings.
- Supplier send / voucher-send.
- Full no-Classic launch.

---

*Validation performed on staging only, read-only, against the existing synthetic
Q-2026-0004 and its VV-1 version, via the deployed admin-web summary proxy (the exact
data source the drawer renders). No data created or edited. The visual drawer
rendering is covered by the merged source-grep test + tsc; a real browser drive of
the authenticated staging page was not performed (it requires login credentials).
Classic remains the system of record.*
