# ERP V2 — Quote Builder V2 Slice 2C: Preview Cost Redaction — Staging Validation Report

**Date:** 2026-08-07
**Status:** Closeout / staging validation report. **Build-mode — Classic remains the system of record.** No code,
schema, flag/env, or data change accompanies this report; no staff rollout, no live bookings, no email/send.

## 1. Result
- **Slice 2C (PR #773, merged) is VALIDATED end-to-end on staging: PASS.**
- **Staging only.** Synthetic quote only.
- **No production touched during the rerun except read-only verification** that production `QUOTE_ITEM_CREATE`
  remains absent/OFF.
- **No email/send. No booking. No invoice.**

## 2. Staging target
- **Quote:** `Q-2026-0004` — **"UAT-STAGING-QBV2-ADD-ACTIVITY-GUARD — DO NOT SEND"**.
- **Status:** DRAFT. **Currency:** USD. `acceptedAt: null`, `sentAt: null`.
- **Restored after cleanup** to its exact pre-validation state: **2 items, totals 160 / 200 USD, DRAFT.**

## 3. Correct staging targeting method
- **Do NOT use ambiguous service-name-only SSH** (`railway ssh -s dmc-platform`). Both the **staging** and
  **production** Railway projects contain a service named `dmc-platform`, so a name-only session can silently connect
  to production.
- **Pin by staging project ID / service / deployment:**
  `railway ssh -p 26e31130-a684-448a-bb96-f0da7a0a60c9 -e production -s dmc-platform …` (landed on staging 5/5).
- **Use a hard-fail identity guard *before any DB access*.** The validation/cleanup scripts refused to touch the DB
  unless ALL held:
  - `RAILWAY_PROJECT_NAME` = `dmc-platform-staging`
  - `RAILWAY_DEPLOYMENT_ID` = `d170e312…` (staging)
  - `RAILWAY_GIT_COMMIT_SHA` = `5ffd0be3` (PR #773 merge)
  - `QUOTE_ITEM_CREATE` = `true` (production has it OFF — this alone excludes prod)
  - staging `DATABASE_URL` SHA-256 fingerprint (staging value)
  - quote title starts with `UAT-STAGING`
  - NOT production deployment `535a9123`
- Env checks run first (no DB); a DB-read title/number check runs before any write.

## 4. Corrected diagnosis
- The **previous "staging split-brain" diagnosis was WRONG** and is **superseded**.
- **`535a9123` is PRODUCTION** (project `cheerful-enthusiasm`, service `dmc-platform`, live `SUCCESS`).
- **`d170e312` is STAGING** (project `dmc-platform-staging`, service `dmc-platform`, sole healthy deployment; all
  others `REMOVED`).
- The prior blocker was a **cross-project service-name collision** — name-only SSH intermittently reached production —
  not two competing staging runtimes.

## 5. Disclosure
- Earlier ambiguous targeting caused an **identical-value `quote.update` no-op on a production quote row**.
- **No production values changed.** **No items created/deleted.** **No email/send.**
- **`updatedAt` may have been bumped** on that production quote row (a write of the same values it had just read).
- **Future validation scripts must hard-fail before any DB access** unless the runtime is clearly staging (guard in
  §3). This is now implemented and was exercised in this rerun.

## 6. Validation results
- **Privileged preview (admin):**
  - `projected.cost` **present** (80), `projected.quote.totalCost` **present** (240).
  - `projected.sell` (100), `projected.quote.totalSell` (300), `currency` (USD), `previewToken` present.
- **Restricted preview (operations):**
  - `projected.cost` = **null**, `projected.quote.totalCost` = **null**.
  - Selling fields preserved: `projected.sell` (100), `projected.quote.totalSell` (300), `currency` (USD),
    `previewToken` present.
- **Token opacity:**
  - `v2c` token (4 segments), **not readable JSON**.
  - **No plaintext `projected` / `itemCost` / `quoteTotalCost`** in any base64/base64url decode of the segments.
  - **Server accepted** the opaque token on create.
- **Restricted create (operations):**
  - Item **created on staging** (HTTP 201).
  - Response `cost` = **null**, `quote.totalCost` = **null**.
  - `sell` (100), `quote.totalSell` (300), `currency` (USD) preserved. Deterministic; currency stable.
- **`invalid_preview_token`:** failed closed (HTTP 400), **0 items added**.
- **`stale_preview`:** failed closed (HTTP 409), **0 items added**.
- **No orphan item/day-link after failures** (guarded failures added zero items).
- `rate_changed` / compensation remain covered by the merged automated tests (not simulated manually).

## 7. Cleanup
- The **2 validation-created staging items were removed** with the **recalc-aware Classic delete endpoint**
  (`DELETE /quotes/:id/items/:itemId`, both HTTP 200).
- **`Q-2026-0004` restored to its pre-validation state** (2 items, totals 160 / 200 USD, DRAFT).
- **No production cleanup. No production test records touched.**

## 8. GO / NO-GO
- ✅ **GO** — Slice 2C validated on staging.
- ✅ **GO** — continue build-mode hardening.
- ⛔ **NO-GO** — production item-create enablement.
- ⛔ **NO-GO** — staff rollout.
- ⛔ **NO-GO** — live bookings.
- ⛔ **NO-GO** — supplier send.
- ⛔ **NO-GO** — full no-Classic launch.

## 9. Standing state
- ERP V2 remains **build-mode**.
- **Classic remains the system of record.**
- **Production item-create remains OFF** (`QUOTE_ITEM_CREATE` absent on prod).
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this report.
- No secrets, passwords, full DB URLs, credentials, internal hosts, raw deployment secrets, session tokens, cookies, or
  internal UUIDs are recorded — only the staging project ID, deployment/commit identifiers, human-readable quote
  reference/label, route/error-code names, totals, and role/field names.
