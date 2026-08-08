# ERP V2 — Quote Builder V2: Pricing-Apply-Audit Cost Redaction Plan

**Date:** 2026-08-08
**Status:** Planning / read-only inspection. **Build-mode — Classic remains the system of record.** No code, schema,
flag/env, or data change accompanies this plan.

## 1. Current exposure summary
- **Endpoint:** `GET /quotes/:id/pricing-apply-audit` → `getPricingApplyAudit(id, actor)`
  (`quotes.controller.ts:1394`, `@Roles('admin','operations')`; the controller forwards the full
  `AuthenticatedActor`, so `actor.role` is available).
- **Response** is a **read-only, already-whitelisted** mapping of `quote.pricing.apply` `AuditLog` rows (raw metadata /
  tokens are never returned). The mapped shape exposes these **cost / internal-financial** fields:
  - `previousItemTotalCost`
  - `newItemTotalCost`
  - `deltaItemCost`
  - `newQuoteTotalCost`
  - `deltaQuoteCost`
  - `appliedPayload.unitCost`
- **Client-safe fields (keep):** `previousItemTotalSell`, `newItemTotalSell`, `deltaItemSell`, `newQuoteTotalSell`,
  `deltaQuoteSell`, `appliedPayload.{currency,quantity,paxCount,serviceDate,customServiceName,guideType,guideDuration,
  overnight}`, `serviceType`, `itemName`, `integrityOk`, `acknowledgedDelta`, `actor {name,email}`, `timestamp`, `id`,
  `quoteItemId`.
- **Not present:** there are **no** `margin` / `markup` / `profit` / `payable` / `supplier-amount` fields and **no raw
  before/after snapshots or preview tokens** in the response — the shape is already whitelisted, so the exposure is
  limited to the six cost fields above.

## 2. Answers
1. **Which roles can access it today?** `admin`, `operations` (+ `super_admin` / `agent_admin` via role-coalescing).
   `finance`, `viewer`, `agent` cannot reach the route. All who can currently receive full cost.
2. **Which fields expose cost/internal values?** The six listed in §1 (item prev/new/delta cost, quote new/delta cost,
   `appliedPayload.unitCost`).
3. **admin / super_admin / finance keep full cost?** Yes (finance can't reach this route, but the predicate stays
   consistent with Slices 2C / A / B).
4. **operations / agent_admin redacted?** Yes — the restricted roles that DO reach the route get the six cost fields
   nulled.
5. **Can redaction be response-only?** **Yes.** This is a pure read: `getPricingApplyAudit` does `auditLog.findMany`
   (read) and maps rows to a client shape. Nulling the cost fields in the mapped output touches **only** the response.
6. **Does redaction affect audit integrity?** **No.** The underlying `AuditLog` rows are never mutated — they retain
   the true cost (the write path records real before/after/delta). Only what a restricted role *sees* is redacted, so
   the audit record and its integrity are fully preserved.
7–9. See §Affected files / §Test plan / §Recommended slice.

## 3. Role policy
- **admin / super_admin / finance → full audit cost.**
- **operations / agent_admin → redacted audit cost** (the six fields → `null` / `undefined`).
- `viewer` / `agent` cannot reach the endpoint.
- **Reuse `canViewQuoteCostMargin`** (`apps/api/src/auth/cost-visibility.ts`) via the existing
  `QuotesService.canActorViewCost(actor)` helper added in Slice A — no new predicate.

## 4. Recommended redaction design
- Compute `const canViewCost = this.canActorViewCost(actor);` once, before the `rows.map(...)`.
- In the mapped object, when `!canViewCost`, emit `null` for `previousItemTotalCost`, `newItemTotalCost`,
  `deltaItemCost`, `newQuoteTotalCost`, `deltaQuoteCost`, and `undefined` for `appliedPayload.unitCost`; leave every
  sell / currency / metadata field exactly as today.
- **Targeted field nulling** (not the generic `redactResponseCost` helper) because these fields are named
  `*ItemTotalCost` / `*QuoteTotalCost` / `unitCost`, not the literal `totalCost` key the generic helper matches.
- No token, guard, or write path is involved (this is a read endpoint) — so nothing there changes.

## 5. Affected files
- `apps/api/src/quotes/quotes.service.ts` — `getPricingApplyAudit`: compute `canViewCost` and null the six cost
  fields for restricted roles. (Actor param stays `CompanyScopedActor`; role is read via the existing
  `canActorViewCost` cast — **no signature change**.)
- `apps/api/src/quotes/quote-item-apply-guard.test.ts` — extend the existing "Read-only pricing-apply audit viewer"
  section with restricted-role redaction + privileged-keeps-cost tests. (The default test `ACTOR` is already `admin`,
  so the existing audit-viewer tests keep asserting cost — no change to those.)
- **Reuse `apps/api/src/auth/cost-visibility.ts`** unchanged.
- **No controller change** (already forwards the full actor), **no admin-web**, **no schema/migration**, **no
  flag/env change**.

## 6. Test plan
- **Privileged (admin):** audit returns the six cost fields populated.
- **Restricted (operations):** audit redacts `previousItemTotalCost` / `newItemTotalCost` / `deltaItemCost` /
  `newQuoteTotalCost` / `deltaQuoteCost` = `null` and `appliedPayload.unitCost` = `undefined`; **sell / currency /
  serviceType / integrityOk / actor / timestamp preserved**.
- **Audit integrity:** the read does not mutate stored rows (the mapped output is the only thing shaped).
- Existing audit-viewer + apply-guard + preview + Slice A/B suites still pass.
- `tsc` clean.

## 7. Risks
- **Low blast radius** — a single read endpoint; response-only nulling; no token/guard/write path involved.
- **Audit integrity preserved** — stored `AuditLog` cost is untouched; only the client view is redacted.
- **Consistency** — uses the same `canViewQuoteCostMargin` policy as Slices 2C / A / B (operations/agent_admin
  redacted).
- **Field-name drift** — if new cost fields are later added to the audit shape, they must be added to the redaction
  list; note this in the code comment.
- No env/secret/flag/schema/admin-web change.

## 8. GO / NO-GO
- ✅ **GO** — a small **backend-only** PR redacting the six cost fields in `getPricingApplyAudit` for restricted
  roles, reusing `canActorViewCost`.
- ⛔ **NO-GO** — new env var, schema/migration, flag change, admin-web change, production/staff/live action.

## 9. Exact next PR scope
- **Title (suggested):** `fix: redact Quote Builder V2 pricing-apply-audit costs`.
- **Backend-only.** In `getPricingApplyAudit`, compute `canViewCost = this.canActorViewCost(actor)` and null
  `previousItemTotalCost` / `newItemTotalCost` / `deltaItemCost` / `newQuoteTotalCost` / `deltaQuoteCost` /
  `appliedPayload.unitCost` for restricted roles; preserve all sell/currency/metadata fields. Add restricted +
  privileged audit-viewer tests. Reuse `canViewQuoteCostMargin` / `canActorViewCost`.
- **Out of scope:** any other endpoint; token/guard changes; flag/env/schema/admin-web changes. This completes the
  cost-redaction sweep for the V2 pricing preview/apply/audit surfaces (2C responses + token, Slice A responses,
  Slice B token opacity, and this audit read).

### Safety confirmations
- Read-only inspection only — no code, schema, flag/env, or data change was made. No production or staging touched.
- No secrets, DB URLs, or token values recorded — only route/field/role/predicate names and file paths.
