# ERP V2 — Quote Builder V2 Slice B: Shared Preview-Token Opacity — Readiness Report

**Date:** 2026-08-08
**Status:** Closeout / readiness report. **Build-mode — Classic remains the system of record.** No code, schema,
flag/env, or data change accompanies this report; no staff rollout, no live bookings, no email/send.

## 1. Scope completed
- **PR #781 — `fix: make Quote Builder V2 shared preview token opaque`** (merged, merge commit
  `19906d785d99c701ff0cc73edfcf1435df8604b3`).
- Shared preview/apply token opacity — the residual cost leak Slice A left in the token is now closed.
- **`apps/api` only.**

## 2. Files changed (4)
- `apps/api/src/quotes/quote-preview-token.ts` — opaque AES-256-GCM conversion.
- `apps/api/src/quotes/quote-preview-token.test.ts` — new opaque-token unit test.
- `apps/api/src/quotes/quote-item-apply-guard.test.ts` — assertion updates only where the `v1` shape was pinned.
- `apps/api/package.json` — register the new test.
- +156 / −34.

## 3. Token behavior
- The old **`v1.<base64url(JSON)>.<HMAC>`** readable token is **replaced**.
- New format: **`v2s.<base64url(iv)>.<base64url(authTag)>.<base64url(ciphertext)>`**.
- **AES-256-GCM**; 12-byte random IV; GCM auth tag provides tamper protection (replaces the HMAC signature).
- **Key derived from the existing `QUOTE_PREVIEW_TOKEN_SECRET`** via `sha256(secret)` — **no new env var**.
- **Projected cost is no longer readable from the token** — a restricted client can no longer base64-decode
  `previewToken` to recover `projItemCost` / `projQuoteCost` (verified by the opacity test).
- **Legacy `v1` tokens fail closed** — `verifyPreviewToken` returns `null` for the `v1` (and any non-`v2s`) format →
  `invalid_preview_token` → the user re-previews. Tokens are never persisted, so there is nothing to migrate.
- **No dual-accept window** — clean cut to `v2s` only.

## 4. Guard behavior (unchanged)
- **`buildPreviewToken` / `verifyPreviewToken` keep the same function names and signatures** — the two
  `quotes.service.ts` call sites are **untouched** (not in the diff).
- **Payload shape is identical after decrypt** — the same canonical JSON snapshot is encrypted instead of base64-signed.
- **Staleness (`previewSnapshotMismatch`), post-apply integrity, `exp`, and `normalizedPayloadHash` checks are
  unchanged** — they operate on the decrypted payload exactly as before.
- **Guard logic unchanged** — opacity changes only the token encoding, not any check.
- **`quotes.service.ts` preview/apply service logic untouched.**
- **Slice 2C `v2c` activity-create token (`quote-create-preview-token.ts`) unchanged** — distinct prefix, not in the
  diff; its test still green.
- `getPreviewTokenSecret`, `isPreviewTokenSecretConfigured`, `normalizePayloadHash`, and Slice A response redaction are
  all unchanged.

## 5. Tests
- **New** `quote-preview-token.test.ts` — round-trip; tamper (ciphertext/tag) → null; wrong secret → null; malformed /
  wrong-version / legacy-`v1` / non-string → null; **NOT base64-decodable to projected cost**; random IV (two builds
  differ, both decrypt equal).
- **Slice 2C create-token test** (`quote-create-preview-token.test.ts`) — still green (v2c unaffected).
- **Preview suite** (`quote-item-preview.test.ts`) — green (incl. Slice A redaction cases).
- **Apply-guard suite** (`quote-item-apply-guard.test.ts`) — green (invalid/stale/payload_mismatch/confirmation/status/
  secret guards all fire identically on the opaque token).
- **Total: 103 pass, 0 fail.**
- **`tsc` clean — 0 errors.**

## 6. Out of scope / follow-ups
- **`pricing-apply-audit` (`GET /quotes/:id/pricing-apply-audit`) response redaction remains a follow-up.**
- No frontend / admin-web changes.
- No production flag changes.
- No staff / live usage.

## 7. GO / NO-GO
- ✅ **GO** — Slice B implemented and merged (PR #781).
- ✅ **GO** — continue build-mode hardening.
- ⛔ **NO-GO** — staff rollout.
- ⛔ **NO-GO** — live bookings.
- ⛔ **NO-GO** — supplier send.
- ⛔ **NO-GO** — full no-Classic launch.

## 8. Standing state
- ERP V2 remains **build-mode**.
- **Classic remains the system of record.**
- **Production item-create remains OFF** (`QUOTE_ITEM_CREATE` absent on prod).
- **Hotel-apply as-was** (prod `QUOTE_PRICING_HOTEL_APPLY=true`; staging aligned for validation).
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

### Safety confirmations
- Report only — no code, schema, flag/env, or data change accompanies this report. No production or staging touched.
- No secrets, DB URLs, or token values recorded — only file paths, token-format/field/function names, PR number, merge
  commit, and test counts.
