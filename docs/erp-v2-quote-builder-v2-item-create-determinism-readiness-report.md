# ERP V2 — Quote Builder V2 Slice 2B-5: Item-Create Determinism Readiness Report

**Date:** 2026-07-18
**Status:** Closeout / readiness report. **Build-mode — Classic remains the system of record.** No code,
schema, flag/env, or data change accompanies this report; no staff rollout, no live bookings, no email.

## 1. Scope completed
- **Slice 2B-1 — Backend guard** (PR #769, merged).
- **Slice 2B-2 — Frontend / proxy preview-confirm** (PR #770, merged).
- **Slice 2B-4 — Staging synthetic validation.**
- **Tests shipped inside 2B-1 / 2B-2** (there was no separate 2B-3 PR).

## 2. Backend behavior (2B-1)
- **Create-preview route** `POST /quotes/:id/v2/experiences/item/preview` — read-only projection (additive,
  pure accessor wrapping `resolveQuoteItemValues`); returns projected item values + additive projected
  quote totals + a signed **preview token**.
- **Preview token** — stateless, signed; binds the intended add + a quote-state snapshot + expiry.
- Typed, fail-closed guard on create:
  - **`invalid_preview_token`** (malformed / expired / identity mismatch).
  - **`stale_preview`** (quote-state snapshot changed since the preview).
  - **`not_resolvable`** (rate cannot be priced — nothing written).
  - **`confirmation_required`** (non-zero delta without `acknowledgedDelta`).
  - **`rate_changed`** (post-write totals drift beyond tolerance).
  - **`compensation_failed`** (rollback failed — surfaced, never swallowed).
- **Compensating `removeItem`** on drift restores the quote (rate_changed path).
- **ACTIVITY-only.**
- **Shared `createItem` / `recalculateQuoteTotals` / `removeItem` unchanged** (reused verbatim; the
  accessor is additive — 24 insertions, 0 removals).

## 3. Frontend behavior (2B-2)
- **Preview price** action → **projected selling price only** displayed (no cost/margin).
- **Confirm & add** → create with **`previewToken` + `acknowledgedDelta`**.
- **Field changes invalidate the preview** (a stale token cannot be confirmed).
- **Typed errors mapped safely** (all six codes) — stale / rate / invalid clear the preview and prompt a
  re-preview.
- **PR #766 / #767 cost-margin protections preserved** (UI gating + hydration-payload redaction).

## 4. Staging validation (2B-4)
- **Staging quote:** **Q-2026-0004**.
- **Label:** **"UAT-STAGING-QBV2-ADD-ACTIVITY-GUARD — DO NOT SEND"**.
- **Staging `QUOTE_ITEM_CREATE=true`.**
- **Production `QUOTE_ITEM_CREATE` OFF.**
- **Happy path:** projected **80 / 100 USD** matched actual **80 / 100 USD** (deterministic, no drift).
- **Currency stable** (USD).
- **`confirmation_required` PASS.**
- **`invalid_preview_token` PASS.**
- **`stale_preview` PASS.**
- **`not_resolvable` covered by automated tests.**
- **`rate_changed` / compensation covered by automated tests.**
- **No booking.**
- **No invoice.**
- **No email / send.**
- **No production touched.**
- **Staging test data left for later cleanup.**

## 5. Risks / follow-ups
- The **preview API response still includes the projected cost**; the **UI displays the selling price
  only**.
- **Response-side preview-payload redaction for restricted roles should be tracked as a later follow-up.**
- **Scope remains ACTIVITY-only.**
- **Guide / meal create remain Classic-only.**
- **Production item-create remains OFF.**
- **No staff / live usage.**

## 6. GO / NO-GO
- ✅ **GO** — Slice 2B completed for **staging synthetic guarded add-activity**.
- ✅ **GO** — continue build-mode hardening.
- ⛔ **NO-GO** — production item-create enablement.
- ⛔ **NO-GO** — staff rollout.
- ⛔ **NO-GO** — live bookings.
- ⛔ **NO-GO** — supplier send.
- ⛔ **NO-GO** — full no-Classic launch.

## 7. Net conclusion
- Quote Builder V2 **add-activity item-create determinism** is **backend-guarded, frontend-wired, and
  staging-validated on synthetic data**.
- It is **not approved for production, staff, or live use**.
- **Classic remains the system of record.**

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this report.
- No secrets, passwords, DB URLs, credentials, internal hosts, raw deployment URLs, project identifiers,
  scratch links, session tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher /
  packet IDs are recorded here — only the human-readable quote reference, label, flag names, route /
  error-code names, PR numbers, totals, and the readiness assessment.
