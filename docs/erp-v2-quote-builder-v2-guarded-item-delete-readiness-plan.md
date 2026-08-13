# ERP V2 — D-0: Guarded Item Delete — Readiness Plan

**Status: readiness plan (doc-only, read-only).** No code, schema, flags, or data. Defines the next smallest V2 slice — removing ONE eligible Quote Builder V2 item from the Experiences step — reusing the existing guarded item-mutation architecture and the deterministic `removeItem` path, with **no pricing-math change**. Classic remains the system of record; production item-mutation remains OFF.

**Verdict up front:** GO for planning. Recommended slice = **preview → confirm → delete** of a single **type-eligible** item (activity / guide / meal / entrance / external_package), excluding hotel/transport, reusing `QUOTE_ITEM_CREATE` (no new flag), delegating to the existing `removeItem` (delete + recalc).

---

## 1. Current state

- V2 can **create** Activity, Guide, Meal, Entrance/Ticket, External Package (M-1…M-3, all merged + staging-validated).
- V2 **cannot remove** items — no V2-scoped delete/edit route exists (only `POST item/preview` + `POST item`).
- Classic is still required to correct/remove any item added in V2.
- `removeItem(itemId, actor)` exists and is **deterministic**: `quoteItem.delete` → `recalculateQuoteTotals` (`quotes.service.ts:6570`).
- The create path already **trusts `removeItem`** — it is the compensating action on post-write drift (`rate_changed`).
- Production item-create remains OFF (`QUOTE_ITEM_CREATE` / `NEXT_PUBLIC_QUOTE_BUILDER_V2_ITEM_CREATE` staging ON / prod OFF).
- Classic remains the system of record.

## 2. Why delete next

- Closes the biggest asymmetry after M-3: five create types with **no way to remove** in V2.
- **Lower risk than item edit** — remove is deterministic (no rate re-resolution); edit re-prices non-deterministically.
- **Lower risk than hotel/transport create** — those are catalog- and pricing-heavy.
- No schema. No catalog prerequisite. No pricing re-resolution. No finance write-path.
- Staging-validatable now on the retained M-3 fixture (two removable external items).

## 3. Scope

- **One item removal only** (no bulk delete).
- Quote Builder V2 / **Experiences step only**.
- Candidate item types (V2-removable): `activity`, `guide`, `meal`, `entrance`, `external_package`.
- **Exclude hotel and transport** from this slice unless the prereq review proves them safe.
- Exclude booking-stage operations / vouchers / packets.
- Exclude accepted/frozen quotes (editable-status gate).
- Exclude any invoice / booking / public-proposal side effects.

## 4. Eligibility rules

To inspect and enforce (all without schema changes):

- item belongs to the quote (`quoteItem.quoteId === :id`).
- quote belongs to the actor's company (brand/company isolation, as the create path does).
- quote is in an editable status. **Reuse the create path's set: `EDITABLE_STATUSES = {DRAFT, READY, REVISION_REQUESTED}`** (`quote-experiences-v2.service.ts:79`).
- quote is the latest revision (no `revisedFromId` child), mirroring create.
- item type is V2-removable (the five create types; **not** hotel/transport).
- item is not tied to an accepted version, invoice, booking, voucher, packet, or locked proposal state — covered indirectly by the editable-status + latest-revision gate (accepted/sent/converted quotes leave the editable set), plus an explicit `acceptedVersionId == null` check on the quote.

### V2-created identity — finding

There is **no per-item "V2-created" marker in the schema** (`QuoteItem` has no `createdVia`/`source`/`origin`/`builderVersion` field; the create path records only an audit-log row `quote.item.created`, which is not a queryable item flag). **Recommendation: type-based eligibility** — remove any item whose classified type is one of the five V2 create types, regardless of whether it was created in V2 or Classic. Classification is derivable from persisted fields today:

| Type | Signal |
|---|---|
| external_package | `externalPackageName` present (service-less; `serviceId null`) |
| activity | `activityId` present |
| hotel (EXCLUDE) | `hotelId` / hotel contract link / `isHotelService` |
| transport (EXCLUDE) | `transportServiceTypeId` / `routeId` / `isTransportService` |
| guide / meal / entrance | `SupplierService` taxonomy (`isGuideService`/`isMealService`) or linked `entranceFee` |

This is the safest no-schema approach. A precise "V2-created only" restriction would require a new column and is **out of scope** (NO-GO for schema this slice).

## 5. Route design — Option A vs Option B

- **Option A — direct DELETE + confirmation ack.** `DELETE /quotes/:id/v2/experiences/item/:itemId` with an `acknowledgedDelta`-style flag. Simplest; relies on the deterministic remove.
- **Option B — preview remove + DELETE confirm with opaque token.** A `POST …/:itemId/remove/preview` projects the resulting selling total (no write) and signs a token binding `quoteId + itemId + pre-remove totals snapshot`; the `DELETE` replays it, failing closed on a stale snapshot.

**Recommendation: Option B (preview → confirm → delete), consistent with the create architecture.** Even though removal is deterministic, the token adds two real protections: (a) the confirm dialog shows the **exact selling-total delta** the user saw, and (b) **`stale_preview`** fail-closed if the quote changed between preview and delete (concurrent edit). No pricing math is introduced — the preview reuses a totals read + recalc projection, not the resolver. *(If the team prefers minimal surface, Option A with a totals-snapshot ack is an acceptable lighter fallback; the prereq check decides.)*

## 6. Backend design

- V2-scoped routes:
  - `POST /quotes/:id/v2/experiences/item/:itemId/remove/preview`
  - `DELETE /quotes/:id/v2/experiences/item/:itemId`
- Reuse the existing role/status/company guards (`assertQuoteAccess`: company isolation + editable status + latest revision) — note `removeItem` today only checks `requireActorCompanyId`, so the V2 wrapper must add the quote-access + item-belongs-to-quote + type-eligibility guards before delegating.
- Reuse the existing flag (`QUOTE_ITEM_CREATE`); fail closed `feature_disabled` when OFF.
- Validate item-belongs-to-quote, latest editable state, and item-type eligibility (reject hotel/transport → `item_not_removable`).
- Delegate final removal to the existing `removeItem` (delete + recalc). **No `removeItem` change.**
- Recalculate totals through the existing `recalculateQuoteTotals` (already inside `removeItem`).
- Audit action: **`quote.item.removed`** (new, mirroring the `quote.item.created` naming; sanitized metadata — itemId, itemType, dayId, resulting totals; no secrets/PII).
- No voucher/packet behavior. No Accept/invoice/booking behavior.

## 7. Frontend design

- Small **Remove** affordance on eligible V2 rows in the Experiences step.
- Hidden when the flag is OFF; hidden for ineligible rows (hotel/transport/non-editable).
- Confirmation dialog showing the **selling-total impact only**.
- Do not show cost/margin to non-finance.
- Reuse the existing proxy/handler pattern (add a thin remove proxy mirroring the item-create proxy — the panel handlers pattern); **no new product/service fetch**.
- No edit UI. No bulk delete.

## 8. Role / access rules

- Recommended: **admin / super_admin / operations** can remove eligible V2 items; **finance** included (already admitted on the shared V2 item route).
- Deletion reveals **no cost/margin** (the response shows a selling-total delta only), so — unlike external-package *create* — external-package *delete* need **not** be finance-only. *(Open question §14; prereq confirms.)*
- Cost/margin visibility rules unchanged.
- `viewer` / `agent` blocked at the route.
- **`agent_admin` must be checked** — RolesGuard coalesces it into `@Roles('admin')`; the service must make an explicit allow/deny decision (removal exposes no cost, so allowing is defensible, but it must be deliberate). Fail closed by default.

## 9. Flag decision

- **Reuse `QUOTE_ITEM_CREATE` + `NEXT_PUBLIC_QUOTE_BUILDER_V2_ITEM_CREATE`.**
- Rationale: this is the same guarded **V2 item-mutation** surface (add/remove of Experiences items). Conflating add+remove under one flag keeps rollout atomic and honors the "no new flag" preference.
- No new flag unless the prereq finds a hard blocker.
- Production remains OFF.

## 10. Redaction / privacy

- Remove preview/confirm response shows **selling delta / total only**.
- No cost/margin to non-finance.
- No supplier rates. No PII. No raw item internals (no `externalNetCost`/`externalInternalNotes`/`externalSupplierName`).
- Audit records true values server-side only.

## 11. Tests to require — backend slice

- flag OFF → `feature_disabled` (no delete).
- quote not found / item not found → fail closed.
- item not belonging to quote → fail.
- locked / non-editable quote (status outside the set, or `acceptedVersionId` set) → fail.
- allowed roles pass; disallowed roles fail; `agent_admin` decision asserted.
- each eligible item type (activity/guide/meal/entrance/external_package) can be removed.
- hotel/transport item → `item_not_removable`.
- remove delegates to `removeItem`.
- totals recalc after remove (quote totals drop by exactly the removed line).
- audit `quote.item.removed` written (sanitized).
- no invoice / booking / voucher / packet side effect.
- stale/changed snapshot → fail closed (if Option B token chosen).
- redaction assertions (response has no cost/margin/internal fields).

## 12. Tests to require — frontend slice

- remove affordance hidden when flag OFF.
- shown only for eligible V2 rows; hidden for hotel/transport/ineligible.
- confirm dialog appears.
- selling delta / total shown only; no cost/margin text for non-finance.
- successful remove updates the row/totals.
- errors mapped (`feature_disabled`, `item_not_removable`, `quote_not_editable`, `stale_preview`, not-found).
- no Accept / invoice / booking / email / voucher calls.

## 13. Staging validation plan

- Use the retained M-3 fixture:
  - quote `fbd0fde8-66ef-4c8d-9e8d-8c2d97cc1e01`
  - day `4b0d0d8a-105f-4ada-9cb2-095459e0877f`
  - M-3a item `4beecd88-569f-43d7-8854-79c2be60c9ef`
  - M-3b item `6bd20760-0df2-43bc-9f5b-2e531a51ce78`
- Remove **only one** retained test item (leave the other as remaining evidence).
- Confirm quote remains DRAFT; totals drop by exactly the removed line.
- Confirm no invoice / booking / public link / voucher / packet / email.
- Project-ID-pinned staging targeting with the hard guard (project `dmc-platform-staging` / `26e31130…`, marker BK-2026-0002, prod excluded).
- Retain remaining fixture evidence for later cleanup.

## 14. Risks / open questions

- Whether a reliable **V2-created** per-item identity can be detected without schema — **finding: no** → type-based eligibility recommended.
- Whether the **preview-token** flow is worth the small added complexity vs a direct delete + ack (prereq decides; plan leans Option B for stale protection).
- Exact **editable-status set** — plan reuses `{DRAFT, READY, REVISION_REQUESTED}`; confirm in prereq.
- Exact **audit action name** — `quote.item.removed` proposed; confirm convention.
- Exact **route role set** — mirror create; confirm `agent_admin` handling.
- Whether **finance** should be allowed to remove non-finance items — yes (no cost exposed); confirm.
- Whether **external-package delete** should inherit create's finance-only gate — plan says **no** (delete exposes no cost); confirm.
- Whether removing a **primary/selected** item affects saved versions or proposal readiness — saved versions are immutable snapshots (`createVersion`), so a live remove does not alter them; verify no proposal-readiness regression on the live quote.

## 15. GO / NO-GO

**GO**
- Readiness planning (this doc).
- Backend **D-a** candidate **after the prereq check** confirms editable-status, audit name, role set, and Option A/B.

**NO-GO**
- Item edit / re-price.
- Hotel / transport create (or delete, unless prereq proves safe).
- Pricing-math changes; `createItem` / `recalculateQuoteTotals` / resolver changes.
- Schema / migration (including a V2-created marker) unless explicitly approved.
- New flag unless a hard blocker is found.
- Production enablement; staff rollout / live bookings.
- Accept / invoice / booking / voucher / packet / send behavior.

## Proposed PR sequence

1. **D-0 readiness plan** (this doc).
2. **D-a prereq check** (read-only) — confirm editable set, audit name, role set (incl. agent_admin), Option A vs B, external-package delete role.
3. **D-a backend** — remove-preview + guarded DELETE → `removeItem`, audit `quote.item.removed`, tests; flag OFF prod.
4. **D-a backend staging validation** + doc (remove one retained fixture item).
5. **D-b frontend** — Remove affordance + confirm dialog (selling delta), reuse handlers/proxy; tests.
6. **D-b frontend staging validation** + doc.
