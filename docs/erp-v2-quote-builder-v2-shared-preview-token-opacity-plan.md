# ERP V2 — Quote Builder V2 Slice B: Shared Preview-Token Opacity Plan

**Date:** 2026-08-08
**Status:** Planning / read-only inspection. **Build-mode — Classic remains the system of record.** No code, schema,
flag/env, or data change accompanies this plan.

## 1. Current token exposure summary
- The shared token (`apps/api/src/quotes/quote-preview-token.ts`) is
  **`v1.<base64url(canonical JSON payload)>.<HMAC-SHA256(segment, secret)>`** — signed but **base64-READABLE**.
- The payload embeds the pricing snapshot including **`projItemCost`, `projItemSell`, `projQuoteCost`,
  `projQuoteSell`** (plus `quoteId`/`itemId`/`companyId`/`optionScope`/updatedAts/`baseItemCount`/`maxItemUpdatedAt`/
  `normalizedPayloadHash`/`serviceDate`/`resolvedRateRefs`/fx/`quoteStatus`/`issuedAt`/`exp`).
- After Slice A redacts cost from the **response body**, a restricted role could still base64-decode the returned
  `previewToken` and read **`projItemCost` / `projQuoteCost`** — the residual leak this slice closes.
- Secret handling: `getPreviewTokenSecret()` (env `QUOTE_PREVIEW_TOKEN_SECRET`, dev fallback) +
  `isPreviewTokenSecretConfigured()` (prod refuses the dev fallback). These stay as-is.

## 2. Scopes affected
The shared token has **exactly one issue site and one verify site** (both in `quotes.service.ts`):
- **Issue:** `previewUpdateQuoteItem` → `buildPreviewToken({ ...snapshot, issuedAt, exp }, getPreviewTokenSecret())`
  (line ~3623).
- **Verify:** `applyPreviewQuoteItem` → `verifyPreviewToken(previewToken, getPreviewTokenSecret())` (line ~4189).
These are shared by **every** preview/apply scope: **meal / activity / guide / entrance / hotel / external-package /
transport (T-A)** — the endpoints are generic; per-scope gating happens elsewhere. So the change is format-only and
affects all scopes uniformly.
- Note: the **Slice 2C activity item-create** path uses a SEPARATE opaque token
  (`quote-create-preview-token.ts`, `v2c.` / AES-256-GCM) and only reuses `getPreviewTokenSecret` +
  `normalizePayloadHash` from this file — it is unaffected.

## 3. Answers
1. **Which scopes use the shared token?** All preview/apply scopes: meal, activity, guide, entrance, hotel,
   external-package, transport — via the single issue/verify pair above.
2. **Which cost fields are inside the token?** `projItemCost`, `projQuoteCost` (cost) and `projItemSell`,
   `projQuoteSell` (selling) — encrypting the whole payload covers all.
3. **Can we safely replace it with an opaque/encrypted token?** **Yes.** Only 2 internal call sites; the token is
   **stateless / never persisted** (no stored-token migration); the payload and all guard checks stay identical — only
   the wire encoding changes from readable+HMAC to encrypted+authenticated.
4. **Reuse the Slice 2C AES-256-GCM pattern?** **Yes** — mirror `quote-create-preview-token.ts`: AES-256-GCM, GCM auth
   tag for tamper protection (replaces the separate HMAC), key = `createHash('sha256').update(secret)`. Use a **distinct
   version prefix** (e.g. `v2s` for "shared") so it never collides with the create token's `v2c`.
5. **Avoid a new env var?** **Yes** — derive the AES key from the existing **`QUOTE_PREVIEW_TOKEN_SECRET`** via SHA-256
   (exactly as the 2C create token does). No new env var; `getPreviewTokenSecret` / `isPreviewTokenSecretConfigured`
   and the prod `NODE_ENV` secret guard in `applyPreviewQuoteItem` remain unchanged.
6. **Backward-compatibility issues?**
   - **In-flight `v1` tokens** issued just before deploy and applied just after → `invalid_preview_token` →
     re-preview. Transient only (15-min TTL), **fail-closed, no data risk**, nothing persisted.
   - **No persisted tokens** anywhere → no migration.
   - Prod + staging already have `QUOTE_PREVIEW_TOKEN_SECRET` set → the AES key is derivable; prod fail-closed guard
     unchanged.
   - Tests that assert the literal `v1.<seg>.<sig>` 3-part shape must be updated to the opaque shape.
7. **Tests required** — see §Test plan.
8. **Safest implementation slice** — see §Recommended design + §Next PR scope.

## 4. Recommended opaque token design
- **Convert `buildPreviewToken` / `verifyPreviewToken` in `quote-preview-token.ts` in place** to AES-256-GCM, keeping
  the **same exported function names and signatures** so the two `quotes.service.ts` call sites need **no change**.
  - Format: **`v2s.<base64url(iv)>.<base64url(authTag)>.<base64url(ciphertext)>`** (12-byte random IV;
    ciphertext = AES-256-GCM of `canonicalJson(payload)`; key = `sha256(getPreviewTokenSecret())`).
  - `verifyPreviewToken` decrypts + GCM-authenticates → returns the payload, or `null` on malformed / wrong-version /
    wrong-key / tampered (GCM auth failure). Expiry + field binding stay the **caller's** checks (unchanged).
  - Keep `normalizePayloadHash`, `getPreviewTokenSecret`, `isPreviewTokenSecretConfigured` **unchanged**.
- **Payload and guard checks are UNCHANGED** — the server decrypts and still compares
  `projItemCost/projQuoteCost/...` in `previewSnapshotMismatch` (staleness) and the post-apply integrity check, and
  reads `normalizedPayloadHash` / `exp`. Opacity changes only the encoding, **not** the guard.
- **Clean cut on the format** (accept only `v2s`) — fully closes the leak immediately; document the transient
  re-preview. *(A dual-accept `v1`+`v2s` transition window is possible but keeps the readable path alive, so it is
  NOT recommended — it defeats the purpose.)*

## 5. Compatibility / rollout risk
- **Transient (low):** in-flight `v1` tokens fail closed → one re-preview; 15-min TTL bounds it; no writes, no data
  risk.
- **Blast radius:** all apply scopes share the token, but the change is format-only (identical payload + checks), so
  every scope behaves the same — regression must exercise ≥2 representative scopes (the apply-guard suite already
  covers meal + entrance + guide + out-of-scope transport/hotel gating).
- **Security parity:** GCM's authenticated decryption replaces the HMAC signature + constant-time compare — equivalent
  tamper protection, plus confidentiality.
- **No env/secret/flag change**, no schema, no persisted-token migration.

## 6. Affected files
- `apps/api/src/quotes/quote-preview-token.ts` — convert `buildPreviewToken`/`verifyPreviewToken` to opaque AES-256-GCM
  (`v2s`); keep `normalizePayloadHash` / `getPreviewTokenSecret` / `isPreviewTokenSecretConfigured` unchanged.
- `apps/api/src/quotes/quotes.service.ts` — **no change** (same function names/signatures; the two call sites are
  unchanged).
- Tests:
  - **New** `apps/api/src/quotes/quote-preview-token.test.ts` (mirrors the 2C token test).
  - `apps/api/src/quotes/quote-item-apply-guard.test.ts` — `mintToken`/`buildPreviewToken` auto-adapt; update any
    assertion that pins the `v1.<seg>.<sig>` shape.
  - `apps/api/src/quotes/quote-item-preview.test.ts` — `typeof previewToken === 'string'` still holds; no change
    expected.

## 7. Test plan
- **Opaque-token unit tests:** round-trip build→verify equals payload; tamper (flip ciphertext/tag) → `null`; wrong
  secret → `null`; malformed / wrong-version / non-string → `null`; **NOT base64-decodable to `projItemCost` /
  `projQuoteCost` / readable JSON**; random-IV (two builds differ, both verify equal).
- **Guard regression (unchanged behavior):** the existing apply-guard suite still passes — `invalid_preview_token`
  (tampered/malformed), `stale_preview` (expired + snapshot mismatch), `payload_mismatch`, `confirmation_required`,
  `status_blocked`, secret-not-configured — all fire identically because the payload semantics are unchanged.
- **Cross-scope:** at least one non-hotel type (meal/entrance) exercised via the existing suite.
- **Slice A redaction tests** still green (they don't depend on token format).
- `tsc` clean; no new failures.

## 8. GO / NO-GO
- ✅ **GO** — a small **backend-only** PR converting the shared token to opaque AES-256-GCM, reusing the 2C pattern +
  the existing secret (no new env var), payload/guard/secret-handling unchanged.
- ⛔ **NO-GO** — a new env var (derive from `QUOTE_PREVIEW_TOKEN_SECRET`), schema/migration, flag change, admin-web
  change, production/staff/live action.
- **Stop conditions to honor while coding:** STOP + report if opacity would require a new env var, would weaken the
  guard/staleness/integrity checks, or would need a schema/flag change (none are expected).

## 9. Exact next PR scope (Slice B)
- **Title (suggested):** `fix: make Quote Builder V2 shared preview token opaque`.
- **Backend-only.** Convert `buildPreviewToken`/`verifyPreviewToken` in `quote-preview-token.ts` to AES-256-GCM (`v2s`,
  key from `QUOTE_PREVIEW_TOKEN_SECRET`); keep function names/signatures + the other exports unchanged; add the
  opaque-token unit test; keep the apply-guard suite green (update only shape-pinning assertions).
- **Out of scope:** `pricing-apply-audit` redaction (separate follow-up), any dual-format transition window, flag/env
  changes.

### Safety confirmations
- Read-only inspection only — no code, schema, flag/env, or data change was made. No production or staging touched.
- No secrets, DB URLs, or token values recorded — only file paths, field/function/format names, and the design.
