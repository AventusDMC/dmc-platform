# ERP V2 — Quote Builder V2: Add-Guide Create — Staging Synthetic Validation Report

**Date:** 2026-08-08
**Status:** Closeout / staging validation report. **Build-mode — Classic remains the system of record.** No code,
schema, flag/env, or data change accompanies this report; no staff rollout, no live bookings, no email/send.

## 1. Result
- **Add-guide create VALIDATED end-to-end on staging: PASS** (post-#789 delegate fix).
- Staging only. Synthetic quote only. No production touched except a read-only flag verification.
- No booking, no invoice, no email/send.

## 2. Context
- **PR #787** — backend add-guide create (ACTIVITY + GUIDE on the guarded Slice 2B flow).
- **PR #788** — frontend add-guide preview→confirm UI (admin-web, behind the existing item-create flag).
- **PR #789** — delegate fix: guide branch now uses `this.prisma.supplierService.findUnique` (the previous
  `(this.prisma as any).service.findUnique` had no delegate → HTTP 500; caught by the first staging validation).

## 3. Staging targeting method
- **Project-ID-pinned** `railway ssh -p 26e31130-a684-448a-bb96-f0da7a0a60c9 -e production -s dmc-platform …`
  (never the ambiguous bare service name).
- **Hard-fail identity guard before ANY DB access**, requiring:
  - project = `dmc-platform-staging`
  - `QUOTE_ITEM_CREATE = true`
  - deployed commit starts with `c1d8750f` (PR #789)
  - staging `DATABASE_URL` SHA-256 fingerprint (`ab62050c502b`)
  - NOT production deployment `535a9123`
  - operated quote title starts with `UAT-STAGING`

## 4. Deployed commit
- Staging runtime commit: **`c1d8750f7fe8600a1666f9ff3d7e54afa117b830`** (= PR #789 merge).
- Staging deployment: **`2e308c83`**.

## 5. Staging quote
- **`Q-2026-0004` — "UAT-STAGING-QBV2-ADD-ACTIVITY-GUARD — DO NOT SEND"**, DRAFT, USD, not accepted/sent, 2 items.

## 6. Flags
- Staging **`QUOTE_ITEM_CREATE = true`**.
- Production **`QUOTE_ITEM_CREATE` absent / OFF**.

## 7. Guide preview result
- Admin preview → **HTTP 201**, `itemType: guide`, **token issued**.
- Guide type **local**, duration **full_day** → **cost 120 / sell 144 USD** (deterministic `GUIDE_RATES.local.full_day`
  120 × 1.2 markup); quote projected sell 344.
- **Restricted (operations) preview:** `projected.cost = null` and `projected.quote.totalCost = null`; **`sell = 144`
  remained visible**, token present — cost/margin redacted.

## 8. Guide create result
- Admin create (`previewToken` + `acknowledgedDelta`) → **HTTP 201, guide item created**, item-count delta +1.
- **Persisted fields:** `serviceId` persisted, `guideType = local`, `guideDuration = full_day`,
  `guideOvernight = false`, `serviceDate = 2026-09-15`, **cost 120 / sell 144 USD**.

## 9. Totals
| Stage | totalCost | totalSell |
|---|---|---|
| Before | 160 | 200 |
| After create | 280 | 344 |
| After cleanup | 160 | 200 |

- After-create matches the preview (item 120 / 144 added). **Currency USD stable.** No unintended drift.

## 10. Guard checks — all fail-closed
- **`invalid_preview_token`** (garbage token) → HTTP 400, failed closed.
- **`stale_preview`** (token pre-dated the create) → HTTP 409, failed closed.
- **Cross-type replay** (an activity token used on a guide create) → HTTP 400 `invalid_preview_token`, failed closed.
- **Non-guide service** → HTTP 400 `not_guide_service`.
- **Missing `guideType`** → HTTP 400 `missing_field`.
- **No orphan items / day-links** — every failed guard added 0 items (only the 1 intended create persisted).

## 11. Cleanup
- The created guide item was removed via the **recalc-aware Classic delete** (`DELETE /quotes/:id/items/:itemId`,
  1/1 deleted).
- **`Q-2026-0004` restored to its pre-validation state: 2 items, 160 / 200 USD.** No leftover; no orphans. No production
  cleanup.

## 12. Confirmations
- **No booking. No invoice. No email/send.**
- **Production unchanged** — read-only prod flag re-check only; no prod Railway / Vercel / DB touched.
- **Production item-create remains OFF** (`QUOTE_ITEM_CREATE` absent on prod).
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

## 13. GO / NO-GO
- ✅ **GO** — add-guide create validated on staging.
- ✅ **GO** — continue build-mode hardening.
- ⛔ **NO-GO** — production item-create enablement.
- ⛔ **NO-GO** — staff rollout.
- ⛔ **NO-GO** — live bookings.
- ⛔ **NO-GO** — supplier send.
- ⛔ **NO-GO** — full no-Classic launch.

### Safety confirmations
- Documentation only — no code, schema, flag/env, or data change accompanies this report.
- No secrets, full DB URLs, or token values recorded — the staging DB/secret appear only as SHA-256 fingerprints; the
  staging project ID + deployment/commit identifiers are operational references.
