# ERP V2 — Quote Builder V2 Slice 2D: Hotel Apply — Staging Synthetic Validation Report

**Date:** 2026-08-07
**Status:** Closeout / staging validation report. **Build-mode — Classic remains the system of record.** No code,
schema, flag/env, or data change accompanies this report; no staff rollout, no live bookings, no email/send.

## 1. Result
- **Hotel preview + apply VALIDATED on staging: PASS**, now that staging `HOTEL_APPLY` is aligned with production.
- **Staging only.** Synthetic quote only. **No production touched** except a read-only flag verification.
- **No email/send. No booking. No invoice.**

## 2. Staging targeting method
- **Project-ID pinning:** every session used `railway ssh -p 26e31130-a684-448a-bb96-f0da7a0a60c9 -e production -s
  dmc-platform …` — never the ambiguous bare `-s dmc-platform` (that service name exists in BOTH the staging and
  production projects).
- **Hard-fail identity guard before ANY DB access.** Scripts refused to continue unless ALL held:
  - `RAILWAY_PROJECT_NAME` = `dmc-platform-staging`
  - `RAILWAY_PROJECT_ID` startsWith `26e31130`
  - `QUOTE_PRICING_HOTEL_APPLY` = `true`
  - staging `DATABASE_URL` SHA-256 fingerprint (staging value `ab62050c502b`)
  - NOT production deployment `535a9123`
  - operated quote title starts with `UAT-STAGING`
- Runtime confirmed: project `dmc-platform-staging`, deployment `8d5b404f`, flag `true`.

## 3. Backend / frontend flag confirmation
- **Backend:** staging `QUOTE_PRICING_HOTEL_APPLY=true` (runtime-verified on `8d5b404f`), with the preconditions
  `QUOTE_PRICING_HOTEL_PREVIEW` / `QUOTE_PRICING_PREVIEW` / `QUOTE_PRICING_APPLY` all `true`.
- **Frontend:** `NEXT_PUBLIC_QUOTE_BUILDER_V2_HOTEL_APPLY=true` on Vercel project `dmc-platform-admin-web-staging`
  (from the Slice 2D remediation). This validation is API-driven; the backend flag is the operative gate.

## 4. Synthetic quote used
- **`UAT-HA-1786093738357` — "UAT-STAGING-QBV2-HOTEL-APPLY — DO NOT SEND"**, DRAFT, USD.
- One hotel item cloned from the QA hotel infrastructure (QA Test Hotel Amman / "QA Hotel Contract 2026", DBL / HB,
  1 night, cost 100 / sell 120). Created read-only from the source QA quote `Q-2026-0001` (source untouched).

## 5. Hotel preview result
- Admin `POST /quotes/:id/items/:itemId/preview` (empty payload) → **HTTP 201, preview token issued**, `available: true`.
- Item current 100 / 120; **projected 100 / 120 USD; delta 0**. Quote projected 100 / 120; delta 0.
- `acknowledgedDelta`: delta was zero, so confirmation was not required (passed `true` regardless).

## 6. Hotel apply result
- Admin `POST …/apply-preview` (previewToken + acknowledgedDelta) → **HTTP 201, `applied: true`**.
- Quote after 100 / 120; item after 100 / 120; DB re-read totals **100 / 120 USD, itemCount 1**.
- Re-priced in place via the existing `updateItem → recalculateQuoteTotals` path (the same write Classic uses).
- **Totals stable 100 / 120 USD; currency USD stable; no drift** (single item).

## 7. Guard checks
- **`invalid_preview_token`:** apply with a garbage token → **HTTP 400 `invalid_preview_token`**; itemCount 1, totals
  unchanged — **failed closed**.
- **`stale_preview`:** a token taken before the successful apply (which bumped the item's `updatedAt` / option-scope
  stamp) → **HTTP 409 `stale_preview`**; itemCount 1, totals unchanged — **failed closed, no partial write**.
- **No orphan / partial state** after either failure.
- Missing/unresolvable rate and rate_changed were not simulated manually (would require corrupting the hotel
  selection); they remain covered by the merged automated tests (`quote-item-apply-guard.test.ts`) — the apply
  re-derives the dry-run and returns `not_resolvable` / only writes on a full match.

## 8. Cleanup
- The synthetic quote and its hotel item were **fully removed** via recalc-safe deletion (`itemsDeleted: 1`,
  `quoteDeleted: true`, `quoteStillExists: false`).
- A follow-up scan found **0 leftover** `UAT-STAGING-QBV2-HOTEL-APPLY` quotes.
- **Source QA quote `Q-2026-0001` untouched** (still ACCEPTED, hotel item cost 100). **No production cleanup.**

## 9. Production confirmations
- **Production unchanged** (read-only re-check): `QUOTE_PRICING_HOTEL_APPLY=true` (as-was), `QUOTE_ITEM_CREATE`
  absent/OFF. No production Railway / Vercel / DB touched.
- Production `HOTEL_APPLY` remains **true** (unchanged).
- Production `QUOTE_ITEM_CREATE` remains **absent / OFF**.

## 10. No booking / invoice / email / send
- Only preview + apply on a synthetic quote item. No booking conversion, no invoice, no email/send, no supplier /
  voucher send.

## 11. Follow-up (tracked, not expanded)
- **Hotel preview/apply API response cost redaction is still NOT covered.** The operations-role preview returned the
  projected cost (100 / 120) just like admin — Slice 2C response cost-redaction (`canViewQuoteCostMargin`) covers only
  the **activity item-create** endpoints, not the hotel preview/apply-preview responses.
- Client-side mitigations from #766 (cost-margin UI gating) and #767 (hydration-payload redaction) remain in place.
- Track as a future **"2C-for-hotel / apply-preview" hardening** candidate. Scope was NOT expanded here.

## 12. GO / NO-GO
- ✅ **GO** — continue build-mode hardening.
- ⛔ **NO-GO** — production flag changes.
- ⛔ **NO-GO** — staff rollout.
- ⛔ **NO-GO** — live bookings.
- ⛔ **NO-GO** — supplier send.
- ⛔ **NO-GO** — full no-Classic launch.

### Safety confirmations
- Documentation only — no code, schema, flag/env, or data change accompanies this report.
- **Classic remains the system of record.** **Voucher-send allowlist remains `ziad@axisdmc.com` only.** **Supplier
  sending remains disabled.**
- No secrets, full DB URLs, or token values are recorded — the staging DB/secret appear only as SHA-256 fingerprints;
  the staging project ID is an operational identifier.
