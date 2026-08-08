# ERP V2 — Quote Builder V2 Slice A: Item Preview/Apply Cost Redaction — Readiness Report

**Date:** 2026-08-07
**Status:** Closeout / readiness report. **Build-mode — Classic remains the system of record.** No code, schema,
flag/env, or data change accompanies this report; no staff rollout, no live bookings, no email/send.

## 1. Scope completed
- **PR #778 — `fix: redact Quote Builder V2 item preview apply costs`** (merged, merge commit `8cab716b`).
- Response-only cost redaction for the **shared** item preview/apply endpoints
  (`POST /quotes/:id/items/:itemId/preview` and `.../apply-preview`), extending the Slice 2C activity-create
  redaction to hotel and every other item type.
- **`apps/api` only.**

## 2. Files changed (3)
- `apps/api/src/quotes/quotes.service.ts` — redaction helpers + role threading.
- `apps/api/src/quotes/quote-item-preview.test.ts` — default actor role + 2 redaction tests.
- `apps/api/src/quotes/quote-item-apply-guard.test.ts` — default actor roles + 4 redaction tests.
- +157 / −10.

## 3. Redaction behavior
- **Role policy** (reuses Slice 2C `canViewQuoteCostMargin`): **admin / super_admin / finance keep full cost**;
  **operations / agent_admin receive `totalCost = null`**; `agent` / `viewer` cannot reach the
  `@Roles('admin','operations')` routes at all.
- **Preview response:** `item.{current,projected,delta}.totalCost` and `quote.{current,projected,delta}.totalCost`
  redacted for restricted roles.
- **Apply success:** `item.{before,after}.totalCost` and `quote.{before,after}.totalCost` redacted.
- **Error echoes:** `stale_preview` and `confirmation_required` (the responses that echo `item`/`quote`) redacted.
- **Preserved for all roles:** `totalSell`, `currency`, `warnings`, `previewToken`, and every non-cost field.
- **Helper:** `redactResponseCost(value, canViewCost)` — returns a CLONE with every nested `totalCost` nulled when the
  actor cannot view cost; pass-through when it can. `canActorViewCost(actor)` reads the role the controller already
  forwards (audit actor shape unchanged).

## 4. Guard / token behavior (unchanged)
- **Shared `quote-preview-token` helper is UNTOUCHED.**
- The preview **token is still built from the raw internal snapshot** (real `projItemCost`/`projQuoteCost`).
- **Guard logic unchanged** — staleness (`previewSnapshotMismatch`), delta / `confirmation_required` detection, and the
  post-apply integrity check all read the **real, unredacted** internal `response` / `snapshot` / `tokenPayload`.
- **Redaction is return/echo-COPY only** — `redactResponseCost` clones and never mutates the internal
  `response`/`before`/`after`, so the audit (`quote.pricing.apply`) also keeps the true cost.

## 5. Tests
- Preview + apply-guard suites: **87 pass, 0 fail** (81 existing + 6 new: privileged-vs-restricted preview,
  privileged-vs-restricted apply success, restricted `confirmation_required` echo, restricted `stale_preview` echo —
  each asserting the guard still fires / no write for restricted roles, and covering a non-hotel meal item type).
- `cost-visibility.test.ts` green.
- **`tsc` clean — 0 errors.**
- No new failures; existing preview/apply-guard coverage intact.

## 6. Out of scope / follow-ups
- **Shared preview-token opacity remains a separate Slice B** — the token still carries readable projected cost
  (required by the guard); making it opaque/encrypted or hash-based is a cross-scope change deferred to its own slice.
- **`pricing-apply-audit` (`GET /quotes/:id/pricing-apply-audit`) response redaction remains a follow-up.**
- **No frontend / admin-web change** (UI already gates cost via #766/#767; this is backend defense-in-depth).
- **No production flag change.**

## 7. GO / NO-GO
- ✅ **GO** — Slice A implemented and merged (PR #778).
- ✅ **GO** — continue build-mode hardening.
- ⛔ **NO-GO** — staff rollout.
- ⛔ **NO-GO** — live bookings.
- ⛔ **NO-GO** — supplier send.
- ⛔ **NO-GO** — full no-Classic launch.

## 8. Standing state
- ERP V2 remains **build-mode**.
- **Classic remains the system of record.**
- **Production item-create remains OFF** (`QUOTE_ITEM_CREATE` absent on prod).
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

### Safety confirmations
- Report only — no code, schema, flag/env, or data change accompanies this report. No production or staging touched.
- No secrets, DB URLs, or token values recorded — only file paths, route/field/role/error-code names, PR number, merge
  commit, and test counts.
