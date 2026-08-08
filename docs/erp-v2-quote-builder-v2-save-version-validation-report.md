# Quote Builder V2 — VV-1 Save Proposal Version: Staging Synthetic Validation Report

**Result: PASS** — Quote Builder V2 can save a proposal version by reusing the
existing `createVersion` flow, producing a snapshot only, with no lifecycle or
financial side effects.

---

## 1. Result

PASS. The V2 "Save proposal version" action was exercised end-to-end against the
real staging API and produced a correct `QuoteVersion` row with no status,
invoice, booking, or Accept side effects.

## 2. Context

- **PR:** [#792](https://github.com/AventusDMC/dmc-platform/pull/792) — `feat: add Quote Builder V2 save proposal version` (merged).
- **Feature:** "Save proposal version" button + optional label in the Quote
  Builder V2 proposal step.
- **Backend reuse:** the action reuses the **existing** `createVersion`
  (`POST /quotes/:id/versions`) via the **existing** `/api/quotes/[id]/versions`
  admin-web proxy. No new backend route, no schema change.
- **Snapshot-only:** `createVersion` writes one `QuoteVersion` row
  (`versionNumber`, optional `label`, `snapshotJson`) and returns it. It does not
  change status, create an invoice, mark sent, accept, or convert to a booking.

## 3. Staging targeting

- **Project-ID-pinned Railway targeting:**
  `railway ssh -p 26e31130-a684-448a-bb96-f0da7a0a60c9 -s dmc-platform -e production`.
  No bare service-name targeting was used (the service name `dmc-platform` exists
  in both staging and prod projects).
- **Hard-fail identity guard** ran inside the container before any DB access and
  passed:
  - project name = `dmc-platform-staging`
  - project id = `26e31130-a684-448a-bb96-f0da7a0a60c9`
  - DB fingerprint = `ab62050c502b` (staging match)
  - production project (`60d81051-…` / `cheerful-enthusiasm`) **not** targeted
  - session secret present
- Production was probed **read-only** (single flag read; no DB access, no write).

## 4. Deployed commit

- Merge commit under validation: **`7827d3cb83dc1b044dad9eec7311bc8bb7a408e6`**.
- admin-web staging (Vercel `git-main` production alias) deployed at the merge
  timestamp; that commit is the tip of `origin/main`.
- Staging API container `RAILWAY_GIT_COMMIT_SHA` = `7827d3cb83dc` — same commit.

## 5. Staging quote

- **Q-2026-0004** — `b89bfcf7-99ec-4f77-8da6-e724e37dbad1`.
- Title: `UAT-STAGING-QBV2-ADD-ACTIVITY-GUARD — DO NOT SEND`.
- Status: **DRAFT** (editable — eligible under the save-version gate).
- **2 V2-created activity items.**
- **0 prior versions** before the test.
- Reused an existing synthetic quote; no new quote created.

## 6. Save-version result

- Real HTTP `POST /quotes/{id}/versions` (in-container, minted staging session
  token, role admin) → **HTTP 201**.
- `versionNumber` = **1** (preMax 0 + 1; `@@unique([quoteId, versionNumber])`
  respected).
- `label` = **"VV-1 staging synthetic validation"**.
- `snapshotJson` **present**.
- New version id: `1cad90e7-f697-4345-800e-cff71f55e7a0`.

## 7. Snapshot checks

Inspected the persisted `snapshotJson` directly from the DB row:

| Element | Present | Key(s) |
| --- | --- | --- |
| Itinerary | ✅ | `itineraries`, `quoteItineraryDays` |
| Items | ✅ | `quoteItems` (2) |
| Pricing totals | ✅ | `totalPrice` (200), `totalCost` (160), `totalSell`, `currentPricing`, `priceComputation`, `pricePerPax` |
| Activity items captured | ✅ | 2 (both `activityId`-linked) |
| Notes / inclusions / exclusions / terms | ✅ | `note`, `inclusionsText`, `exclusionsText`, `termsNotesText` |
| Guide items | N/A | this quote has no guide items |

## 8. Side-effect checks (pre vs post)

| Check | Pre | Post | Result |
| --- | --- | --- | --- |
| status | DRAFT | DRAFT | unchanged ✅ |
| totalPrice | 200 | 200 | unchanged ✅ |
| totalCost | 160 | 160 | unchanged ✅ |
| acceptedVersionId | null | null | still null ✅ |
| invoice | none | none | no invoice ✅ |
| bookings | 0 | 0 | no booking ✅ |
| Accept | — | — | not triggered ✅ |
| versions | 0 | 1 | exactly +1 ✅ |

## 9. Guard checks

- **Unauthorized role** (`operations` — authenticates but is not admin/viewer/finance):
  `POST /versions` → **403 Forbidden** (safe JSON error).
- **No auth token:** `POST /versions` → **401 Unauthorized** (safe JSON error).
- **Gating split:** the backend `createVersion` route is **role-gated**
  (`@Roles('admin','viewer','finance')`) and is intentionally status-agnostic
  (versioning is a shipped Classic capability). The **editable-status gate**
  (DRAFT / READY / REVISION_REQUESTED) is enforced **V2 frontend-side**
  (`page.tsx canSaveVersion`) and is covered by the merged source-grep test. A
  non-editable-status POST was therefore not exercised on the backend (it would
  only create a harmless extra snapshot, not demonstrate a block).

## 10. Cleanup

- No new quote created (reused shared synthetic Q-2026-0004).
- The single `QuoteVersion` row `1cad90e7-f697-4345-800e-cff71f55e7a0`
  (versionNumber 1) was **left in place as staging validation evidence**.
- **Tracked for later staging cleanup.**
- No production cleanup (nothing was created in production).

## 11. Confirmations

- No Accept triggered.
- No invoice created.
- No booking created.
- No email/send action (no supplier-send, no voucher-send, no proposal send).
- Production unchanged (read-only flag probe only; no prod DB access/writes; no
  prod flag/env changes).
- Production item-create remains **OFF** (`QUOTE_ITEM_CREATE` unset in
  `cheerful-enthusiasm`).
- Voucher-send allowlist remains **`ziad@axisdmc.com` only** (untouched).
- Supplier sending remains **disabled** (untouched).

## 12. GO / NO-GO

**GO**

- VV-1 (Save proposal version) validated on staging.
- Continue build-mode hardening.

**NO-GO**

- Accept flow.
- Invoice creation.
- Booking creation.
- Staff rollout.
- Live bookings.
- Supplier send.
- Full no-Classic launch.

---

*Validation performed on staging only, against a clearly-labeled synthetic quote,
read-mostly with a single snapshot write. Classic remains the system of record.*
