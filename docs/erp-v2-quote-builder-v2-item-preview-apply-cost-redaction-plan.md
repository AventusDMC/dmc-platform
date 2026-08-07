# ERP V2 — Quote Builder V2: Hotel Preview/Apply Response Cost Redaction Plan

**Date:** 2026-08-07
**Status:** Planning / read-only inspection. **Build-mode — Classic remains the system of record.** No code, schema,
flag/env, or data change accompanies this plan.

## 1. Current exposure summary
The hotel preview/apply endpoints are the **shared** item preview/apply endpoints (not hotel-specific):
- Preview: `POST /quotes/:id/items/:itemId/preview` → `previewUpdateQuoteItem` → `computeItemPreview`.
- Apply: `POST /quotes/:id/items/:itemId/apply-preview` → `applyPreviewQuoteItem`.
Both are `@Roles('admin','operations')` (so `super_admin`/`agent_admin` also reach them via role-coalescing;
`finance`/`viewer`/`agent` do **not** reach them).

**Cost/internal fields returned to the client (unredacted today):**
- **Preview response** (`computeItemPreview`): `item.current.totalCost`, `item.projected.totalCost`,
  `item.delta.totalCost`, and `quote.current/projected/delta.totalCost`.
- **Apply success** (`applyPreviewQuoteItem` return): `item.before.totalCost`, `item.after.totalCost`,
  `quote.before.totalCost`, `quote.after.totalCost`.
- **Apply error echoes:** `stale_preview` and `confirmation_required` include `quote: response.quote` +
  `item: response.item` → the same `*.totalCost` fields. (`invalid_preview_token`, `feature_disabled`,
  `token_secret_not_configured`, `not_resolvable` carry **no** cost — `not_resolvable` returns `warnings` only.)
- **Adjacent read surface:** `GET /quotes/:id/pricing-apply-audit` returns before/after/delta cost from the audit log
  (whitelisted shape, but still cost) — a separate endpoint, flagged as related scope.
- **Preview token** (shared `buildPreviewToken`): the signed-but-**base64-readable** payload embeds
  `projItemCost`, `projItemSell`, `projQuoteCost`, `projQuoteSell`. A restricted client can decode the token and read
  projected cost even if the response body is redacted.
- **Client-safe fields (keep):** all `totalSell` values (selling price), `currency`, `warnings`, `available`,
  `blocked`, `previewToken` (opaque handling discussed in §Token safety), rate/resolution ids (non-cost).

**Slice 2D confirmed** the observable leak: an `operations`-role hotel preview returned `projected 100/120` (cost 100).

## 2. Which roles currently receive cost
Everyone who can reach the routes: **admin, super_admin, operations, agent_admin** — all currently get full cost.
(`finance`, `viewer`, `agent` cannot reach `@Roles('admin','operations')`.)

## 3–5. Policy + predicate reuse
- **admin / super_admin / finance → full cost.** (`finance` won't reach these routes, but the predicate stays
  consistent with Slice 2C.)
- **operations / agent_admin (the restricted roles that DO reach the routes) → redacted cost.** (`agent` / `viewer`
  can't reach the routes at all.)
- **Reuse Slice 2C `canViewQuoteCostMargin(role)`** (`apps/api/src/auth/cost-visibility.ts`, = admin/super_admin/finance)
  **verbatim** — no change. The role is already available in the controller via `@Actor() actor: AuthenticatedActor`;
  it just needs threading into the service (see §Affected files).

## 6. Token safety assessment — response redaction vs token opacity
- **Response redaction is response-only and does NOT weaken the guard.** The apply guard reads the **server-side**
  freshly-derived snapshot and the token (`previewSnapshotMismatch` for `stale_preview`; the post-apply integrity check
  comparing persisted totals to `tokenPayload.projItemCost/projQuoteCost`). None of that depends on the response body,
  so redacting the response leaves staleness/integrity/confirmation logic fully intact.
- **The token is a residual leak.** `buildPreviewToken` is HMAC-signed but base64-**readable** and carries
  `projItemCost/projQuoteCost`, which the guard **requires** (staleness + integrity). After response redaction, a
  restricted role could still decode the token to read projected cost.
- **The token is SHARED across every apply scope** (meal/activity/guide/entrance/hotel/external/transport). Slice 2C
  deliberately left this shared token untouched (it introduced a *separate* opaque create-scoped token instead).
  Making the shared token opaque — or replacing raw `projCost` with a hash drift-signal — is a **cross-scope** change
  with a wide regression surface.
- **Recommendation:** ship **response-only redaction first** (closes the observed, directly-returned leak). Treat token
  opacity as a **separate, later slice** (either AES-GCM-encrypt the shared token like 2C's create token, or store a
  hash of the projected cost instead of the raw value so staleness still works without exposing cost). Do **not** bundle
  them; the token change needs its own all-scopes regression pass.

## 7. Recommended redaction design (Slice A — response-only)
- Add a single internal helper `redactPreviewResponseCost(response, canViewCost)` in `quotes.service.ts` that, when
  `!canViewCost`, sets every `*.totalCost` in `item.{current,projected,delta}` / `quote.{current,projected,delta}`
  (preview) and `item.{before,after}` / `quote.{before,after}` (apply) to `null`, leaving `totalSell`, `currency`,
  `warnings`, and `previewToken` intact.
- Compute `canViewCost = canViewQuoteCostMargin(actor?.role ?? null)` once and apply it at every client-facing return:
  the preview return, the apply success return, and the `stale_preview` / `confirmation_required` error echoes.
- **Redact the RESPONSE only — never the `snapshot`/token** (the token keeps real cost for the guard).
- Applies at the **shared** layer, so it covers all item-type previews/applies consistently (a feature: uniform cost
  policy for restricted roles), not hotel alone — call this out in the PR.
- **Audit unchanged:** `quote.pricing.apply` audit metadata keeps the true before/after cost (server-side record).

## 8. Affected files (Slice A)
- `apps/api/src/quotes/quotes.service.ts` — thread role/`canViewCost` into `previewUpdateQuoteItem` /
  `computeItemPreview` / `applyPreviewQuoteItem`; add + apply the response redaction helper at the return/echo points.
- `apps/api/src/quotes/quotes.controller.ts` — pass `actor.role` (or a computed `canViewCost`) into the two service
  calls (role already available via `@Actor()`).
- `apps/api/src/auth/cost-visibility.ts` — **reused unchanged** (`canViewQuoteCostMargin`).
- Actor typing: widen the service param from `CompanyScopedActor` to also carry `role` (or add a `canViewCost: boolean`
  param) — minimal, additive.
- **No `apps/admin-web` change** (UI already gates cost via #766/#767; this is backend defense-in-depth).
- **No schema/migration, no flag/env change.**
- *(Optional, related)* `getPricingApplyAudit` cost redaction — recommend a follow-up, not part of Slice A.

## 9. Test plan
- Privileged (admin) preview returns cost; **restricted (operations) preview redacts** `item`/`quote` `totalCost`
  (null), keeps `totalSell`/`currency`/`previewToken`.
- Privileged apply returns before/after cost; **restricted apply success redacts** before/after `totalCost`, keeps sell.
- **Restricted error echoes** (`stale_preview`, `confirmation_required`) redact `item`/`quote` cost.
- **Guard-intact regression:** for a restricted role, `invalid_preview_token`, `stale_preview`, and
  `confirmation_required` still fire correctly (redaction is response-only).
- Predicate coverage already exists (`cost-visibility.test.ts`).
- Existing `quote-item-preview.test.ts` + `quote-item-apply-guard.test.ts` still pass (extend for the redaction cases).
- Representative non-hotel type (e.g. activity/meal) also redacts, proving the shared-layer behavior.

## 10. Risks
- **Scope breadth:** redaction is at the shared preview/apply layer → affects all item types, not just hotel. Intended,
  but the regression must cover ≥2 representative types.
- **Guard weakening (avoided):** the token/snapshot must stay untouched; only the response is shaped. Tests assert the
  guard still fires for restricted roles.
- **Residual token leak (accepted for Slice A):** the shared token still carries readable projected cost — documented,
  deferred to a separate token-opacity slice.
- **Role threading:** must not alter the audit actor shape or company scoping (additive role only).
- **`getPricingApplyAudit`** remains a cost surface until a follow-up covers it.

## 11. Exact next PR scope (Slice A)
- **Title (suggested):** `fix: redact Quote Builder V2 item preview/apply response costs`.
- **Backend-only.** Add `redactPreviewResponseCost` + thread `canViewQuoteCostMargin(actor.role)` into preview/apply
  returns and the two cost-echoing error responses; keep token/snapshot/guard untouched; reuse the 2C predicate.
- Tests: privileged-vs-restricted preview + apply + error-echo redaction; guard-intact regression; a non-hotel type.
- **Explicitly out of scope:** shared-token opacity (separate slice), `getPricingApplyAudit` redaction (follow-up),
  any flag/env/prod/staging change.

## 12. GO / NO-GO
- ✅ **GO** — a small **backend response-redaction** PR (Slice A), reusing `canViewQuoteCostMargin`.
- ⛔ **NO-GO** — touching the shared apply/preview token in this slice (defer opacity to Slice B).
- ⛔ **NO-GO** — production flag changes, staff rollout, live bookings, supplier send, full no-Classic launch.

### Safety confirmations
- Read-only inspection only — no code, schema, flag/env, or data change was made.
- **Classic remains the system of record. Voucher-send allowlist remains `ziad@axisdmc.com` only. Supplier sending
  remains disabled.** No production or staging touched.
- No secrets, DB URLs, or token values recorded — only route/field/role/error-code names and file paths.
