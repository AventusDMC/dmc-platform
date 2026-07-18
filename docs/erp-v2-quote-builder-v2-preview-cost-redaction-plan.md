# ERP V2 — Quote Builder V2 Slice 2C: Preview Response-Side Cost Redaction Plan

**Date:** 2026-07-18
**Status:** Planning / read-only inspection. **Build-mode — Classic remains the system of record.** No code,
schema, flag/env, or data change accompanies this plan.

## 1. Current exposure summary
- The **preview response exposes `projected.cost` and `projected.quote.totalCost`**.
- The **create response exposes `cost` and `quote.totalCost`**.
- The **`previewToken` is a signed but READABLE base64 JSON** payload (HMAC-signed, not encrypted).
- The **token contains projected `itemCost` / `quoteTotalCost`** (a restricted client can base64-decode it
  and read cost).
- **Error responses do not leak cost** (they are `{code, message}`, plus `itemId` on `compensation_failed`).
- The **V2 controller currently drops `actor.role`** (`toActor` builds `{id, companyId, auditLabel}` only),
  even though `AuthenticatedActor.role` is available.

## 2. Correct redaction location
- **Backend `apps/api`, not the admin-web proxy.**
- The **proxy cannot safely redact / re-sign the token** (it is HMAC-signed) and would duplicate role
  logic.
- **Role policy belongs at the server response layer.** The proxy needs no change.

## 3. Role policy
- **admin / super_admin / finance** receive the full cost/margin preview.
- **operations / agent / viewer / agent_admin** receive **redacted** preview / create responses.
- **Do not use `PII_FULL_ROLES`** (it includes `operations`). The correct predicate mirrors admin-web
  `canAccessFinance` = admin / super_admin / finance. *(Operations still perform the add and see the
  selling price — just not cost.)*

## 4. Fields to redact for restricted roles
- **`projected.cost`.**
- **`projected.quote.totalCost`.**
- **`cost`.**
- **`quote.totalCost`.**
- **Any future margin / markup / profit / payable / internal financial fields.**

## 5. Fields to preserve
- **`sell` / `projected.sell`.**
- **`quote.totalSell`.**
- **`currency`.**
- **`pax` / per-person if present.**
- **Client-safe itinerary / activity information.**

## 6. Token safety
- The **current token is signed but readable**.
- The **token cost values are a residual leak**.
- **Slice 2C implementation should include an opaque / encrypted create-preview token.**
- The **shared apply-path token must remain untouched** (a NEW create-scoped helper).
- The **server must keep full projected cost internally for the drift compare** (the token must still carry
  the preview-time projected totals — so the fix is to make the payload opaque, not to drop cost).

## 7. Implementation recommendation
- **Add an `apps/api` cost-visibility predicate** (e.g. `canViewQuoteCostMargin(role)` =
  admin / super_admin / finance; add a unit test).
- **Thread the actor role (or a computed `canViewCostMargin`) into `quote-experiences-v2`.**
- **Sanitize the preview response.**
- **Sanitize the create response.**
- **Introduce a create-preview opaque token helper** (leave the shared apply token untouched).
- **Leave the admin-web proxy unchanged.**
- **Keep the guard logic unchanged** (redact output *after* the drift compare; the server keeps full cost
  internally).

## 8. Test plan
- Privileged **preview** response includes cost.
- Restricted **preview** response redacts cost.
- Privileged **create** response includes cost.
- Restricted **create** response redacts cost.
- **Selling totals still visible.**
- **Role-predicate tests** (admin/super_admin/finance true; operations/agent/viewer/agent_admin false).
- **Token no longer base64-decodes to plaintext cost.**
- **Existing 2B guard tests still pass.**
- **Shared apply-token tests unchanged.**

## 9. Risks
- **Token residual leak if opacity is deferred.**
- **Do not weaken the guard / drift compare.**
- **Role threading must not break the audit actor shape.**
- **Operations should remain excluded from cost visibility.**
- **Encryption / key handling should reuse the existing secret pattern where safe** (e.g. derive from
  `QUOTE_PREVIEW_TOKEN_SECRET`; avoid a new env var; keep the apply token untouched).

## 10. GO / NO-GO
- ✅ **GO** for a **small backend redaction PR** after this doc.
- ⛔ **NO-GO** — production item-create enablement.
- ⛔ **NO-GO** — staff rollout.
- ⛔ **NO-GO** — live bookings.
- ⛔ **NO-GO** — supplier send.
- ⛔ **NO-GO** — full no-Classic launch.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this plan.
- No secrets, passwords, DB URLs, credentials, internal hosts, raw deployment URLs, project identifiers,
  scratch links, session tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher /
  packet IDs are recorded here — only route / field / role / predicate names, error-code names, and the
  plan.
