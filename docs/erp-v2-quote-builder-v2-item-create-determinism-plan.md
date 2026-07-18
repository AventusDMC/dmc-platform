# ERP V2 — Quote Builder V2 Slice 2B: Item-Create Determinism / Recalc Delta Guard Plan

**Date:** 2026-07-18
**Status:** Planning only. **Build-mode — Classic remains the system of record.** No code, schema,
flag/env, or data change accompanies this plan; no staff rollout, no live bookings, no email.

## 1. Current behavior
- **Route:** `POST /quotes/:id/v2/experiences/item`.
- **Service:** `QuoteExperiencesV2Service.addActivityItem` — **ACTIVITY-only V2 create today** (validates
  day / activity / rate-variant integrity).
- Delegates to the **shared `QuotesService.createItem`** → `resolveQuoteItemValues` (pure compute) →
  `quoteItem.create` → **`recalculateQuoteTotals`** (full-quote re-price).
- **Guide / meal create remain Classic-only** (no V2 create route).
- **Apply paths already have the preview-token / `acknowledgedDelta` guard** (`applyPreviewQuoteItem`:
  `verifyPreviewToken` → `previewSnapshotMismatch` → `stale_preview` → `not_resolvable` →
  `confirmation_required` → write). **Create has none of these.**

## 2. Drift risk map
- **Adding one item can re-price pre-existing items** — `recalculateQuoteTotals` re-prices the whole quote
  from current live rates, so an add can move items whose underlying rates changed since they were added.
- **`totalCost` / `totalSell` / `margin` / `markup%` / `sellingPrice` / `perPerson` can move
  unexpectedly**, with no preview and no confirmation.
- **Currency drift risk** if a rate resolves in a different currency.
- **Drift can later propagate into a saved version / Accept invoice** (create is gated to editable
  statuses, but a drifted DRAFT can be versioned/accepted afterwards).

## 3. Proposed guard
Mirror the apply path, reusing the existing token infra:
- **Create-preview dry-run** (pure `resolveQuoteItemValues`, no write) computes the projected new-item
  values + quote-total delta.
- **Signed `previewToken`** carrying a **quote-state snapshot**, projected new-item values, projected quote
  totals, currency, `issuedAt`, `exp`.
- **`previewSnapshotMismatch`** at create time detects a changed quote → **`stale_preview`**.
- Typed fail-closed errors: **`stale_preview` / `not_resolvable` / `confirmation_required` / `rate_changed`**.
- **`acknowledgedDelta` requirement** when the previewed add changes pricing.
- **Transactional create-with-compare**: create + recalc inside a transaction; compare actual quote totals
  to the token's projected totals within a tolerance; **fail closed (roll back) if they differ**.
- **Fail closed if actual totals differ from previewed totals** — previewed price == committed price, or
  nothing is written.
- **Keep the shared `createItem` unchanged for Classic safety** — the guard lives in the V2 wrapper
  (`addActivityItem`); Classic create is untouched.

## 4. Implementation caution
- **Transaction compatibility must be inspected before coding.** `createItem` is currently NOT transactional
  and is shared with Classic.
- **Do not force `$transaction`** if `createItem` / `recalculateQuoteTotals` cannot safely run on the same
  transaction client (e.g., if they open their own connections or nested writes that a shared `tx` client
  would break).
- **If transaction compatibility is unsafe, stop and report a safer design** (e.g., pre-commit projection /
  compare-and-revert, or a create-preview that returns the exact projected totals the create must match)
  instead of forcing a risky transactional refactor of the shared path.

## 5. API / UI impact
- **New create-preview route / service** (dry-run).
- **`addActivityItem` requires `previewToken` + `acknowledgedDelta`.**
- **Frontend add-activity becomes preview-then-confirm** (mirror the existing apply modal, which already
  does token + `acknowledgedDelta`); handle the typed error codes (re-preview on `stale_preview`).
- **No flag changes.**
- **No role policy changes** (admin/operations + editable status; cost/margin gating from #766/#767
  preserved).

## 6. Test plan
- Create **succeeds** when the preview delta matches (token valid + `acknowledgedDelta=true`).
- Create **fails `confirmation_required`** when the delta is non-zero and unacknowledged.
- **`stale_preview`** when the quote changed since the preview.
- **Expired / tampered token rejected.**
- **Missing-rate → `not_resolvable`**, nothing written.
- **No unintended total drift** — adding one item moves totals by exactly its contribution; pre-existing
  items unchanged (or fail closed).
- **Multi-item recalc stable.**
- **Currency stable.**
- **Cost/margin gating from PR #766 / #767 preserved.**

## 7. Migration / data
- **No migration** (token is a stateless HMAC; no new columns/tables).
- **No backfill.**
- **Existing quotes not mutated by the plan.**

## 8. Recommended implementation slices
- **Slice 2B-1 — Backend guard** (create-preview + token + transactional-or-safer create-with-compare;
  shared `createItem` unchanged).
- **Slice 2B-2 — Frontend preview-confirm flow.**
- **Slice 2B-3 — Tests.**
- **Slice 2B-4 — Staging synthetic validation.**
- **Slice 2B-5 — Doc / readiness report.**

## 9. GO / NO-GO
- ✅ **GO** for planning and later **staging-only** build validation.
- ⛔ **NO-GO** for staff rollout.
- ⛔ **NO-GO** for live bookings.
- ⛔ **NO-GO** for supplier send.
- ⛔ **NO-GO** for production flag changes.
- ⛔ **NO-GO** for full no-Classic launch.

## 10. Safety confirmation
- Planning only.
- No code.
- No data.
- No flags.
- No production / staging writes.
- Item-create remains OFF in prod.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this plan.
- No secrets, passwords, DB URLs, credentials, internal hosts, raw deployment URLs, project identifiers,
  scratch links, session tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher /
  packet IDs are recorded here — only route / service / method names, flag names, error codes, and the
  plan.
