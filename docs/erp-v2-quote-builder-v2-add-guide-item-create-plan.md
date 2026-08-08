# ERP V2 — Quote Builder V2: Add-Guide / Item-Create Coverage Plan

**Date:** 2026-08-08
**Status:** Planning / read-only inspection. **Build-mode — Classic remains the system of record.** No code, schema,
flag/env, or data change accompanies this plan.

## 1. Current capability matrix

| Item type | V2 **CREATE** (add new item) | V2 **EDIT / apply-preview** (existing item) | Classic CREATE |
|---|---|---|---|
| **Activity** | ✅ **guarded** (determinism guard; staging-validated; prod flag OFF) | ✅ | ✅ |
| **Guide** | ❌ Classic-only (PR #604 drafted, **not merged**, predates the guard) | ✅ (guide apply live) | ✅ |
| **Meal** | ❌ Classic-only | ✅ | ✅ |
| **Entrance / Ticket** | ❌ Classic-only | ✅ (entrance apply behind its flags) | ✅ |
| **Hotel** | ❌ Classic-only | ✅ (hotel apply live in prod) | ✅ |
| **External package** | ❌ Classic-only | ✅ (preview live; apply behind flag) | ✅ |
| **Transport** | ❌ Classic-only | ✅ (preview live; T-A apply behind flag) | ✅ |

- **V2 CREATE today = ACTIVITY only.** The route (`POST /quotes/:id/v2/experiences/item[/preview]`,
  `@Roles('admin','operations')`) rejects any non-activity `itemType` as `out_of_scope`
  (`quote-experiences-v2.service.ts:134`). Gated by `QUOTE_ITEM_CREATE` (+ `NEXT_PUBLIC_QUOTE_BUILDER_V2_ITEM_CREATE`
  on the frontend); prod flag OFF.
- The activity create path is **guarded** (Slice 2B-1/2B-2): create-preview projects the price with NO writes via the
  pure `previewCreateItemValues` and signs a token; the guarded create verifies token + snapshot, delegates to the
  shared `createItem`, then post-write-compares and **compensating-removes** on drift. Its create/preview responses are
  **cost-redacted** for restricted roles (Slice 2C, item-type-agnostic).

## 2. Gap list
- **Guide create** — the only remaining *deterministic* create type not covered by V2. Drafted as PR #604 but never
  merged, and that draft **predates the Slice 2B determinism guard** (so it must be re-done ON the guarded path, not
  merged as-is).
- **Meal / entrance / hotel / external / transport create** — Classic-only; each is either non-deterministic on create
  or carries additional side effects (entrance sibling-sync, hotel FOC/allotment, transport regime engines), so they
  are deliberately out of scope for near-term V2 create.

## 3. Answers
1. **Which types can V2 create today?** ACTIVITY only.
2. **Which are Classic-only (create)?** Guide, meal, entrance/ticket, hotel, external package, transport.
3. **Is add-guide ready to implement safely?** **Yes.**
   - Guide pricing is **deterministic**: `GUIDE_RATES` (a constant rate table in `quotes.service.ts`) +
     `GUIDE_DEFAULT_MARKUP = 20` — no DB rate-variant lookup, no FX/date dependence → the price is reproducible between
     preview and create (exactly what the determinism guard needs).
   - Persisted columns exist: `guideType` / `guideDuration` / `guideOvernight` (PR #551), so create + audit + re-price
     work without parsing text.
   - The shared `createItem` / `resolveQuoteItemValues` already price guide items (guide-compat guard).
   - **Side-effect-clean by parity with activity:** `createItem` calls `maybeInheritContractFoc(quoteId, contractId)`;
     a guide item has `contractId = null` (same as an activity), so that side effect is a no-op — no entrance
     sibling-sync, no hotel FOC/allotment. The determinism guard's post-write compare + compensating `removeItem` hold
     exactly as for activity.
4. **Build add-guide next or scope out?** **Build next.** It is the natural, low-risk extension: deterministic,
   side-effect-clean, and it reuses the existing guard machinery. Re-implement PR #604 **on** the guarded path.
5. **Routes affected.**
   - **Backend:** extend the existing V2-scoped route to accept `itemType='guide'` — `resolveContext` + `buildCreateInput`
     branch by type; the token/snapshot/compare/compensation guard stays identical. Guide input =
     `serviceId` (a **guide-type SERVICE** via `/api/services`, NOT `/api/guides` which are people) + `guideType` +
     `guideDuration` + `guideOvernight` (+ optional pax). No new route.
   - **Frontend:** add-guide UI in the experiences step, behind the **same** `NEXT_PUBLIC_QUOTE_BUILDER_V2_ITEM_CREATE`
     flag; guide-type service picker via the `/api/services` proxy; reuse the preview→confirm flow.
6. **Pricing/determinism guard needed.** The **same** guard as activity — a pure `previewCreateItemValues` projection +
   signed token binding the intended guide add + a pre-create snapshot; the guarded create verifies token + snapshot,
   handles `not_resolvable` / `confirmation_required`, delegates to the shared `createItem`, post-write compares, and
   compensating-removes on drift. No new guard concept.
7. **Reuse the activity create-preview/token flow?** **Yes** — the guard machinery is generic; only `resolveContext`
   (validation) and `buildCreateInput` (payload) are type-specific. Refactor those two to branch activity vs guide; keep
   `CREATE_TOKEN_KIND` scoped (e.g. add a guide kind or a `itemType` field in the token) so an activity token can't be
   replayed as a guide create. Response cost redaction is already item-type-agnostic.
8. **Tests required.** Guide create-preview projects a deterministic price + token; guarded create happy path (guide);
   `confirmation_required`; `stale_preview`; `invalid_preview_token`; `not_resolvable`; drift → `rate_changed` +
   compensating `removeItem`; guide-specific validation (missing `serviceId` / `guideType` → typed error; non-guide
   service rejected); cross-type token replay rejected (activity token ≠ guide add); audit `quote.item.created`
   `itemType: guide`; existing **activity** create tests unchanged; restricted-role create response cost-redacted.
   Plus a staging synthetic validation (project-ID-pinned, hard-fail guard, cleanup).
9. **Safest next implementation slice.** **Phase B Slice 3 (re-do) — add ONE guide item via the guarded V2 create
   route**, ACTIVITY + GUIDE only, reusing the determinism guard and the **same** flags (`QUOTE_ITEM_CREATE` +
   `NEXT_PUBLIC_QUOTE_BUILDER_V2_ITEM_CREATE`); backend + minimal frontend; prod flags stay OFF; staging-validate on
   synthetic data.

## 4. Add-guide recommendation
**GO** to build **add-guide create** as the next slice, on the guarded path, behind the existing flags (prod OFF).
Do **not** merge the old PR #604 as-is (it predates the guard). Keep scope to **GUIDE only** (activity already shipped);
do not broaden to meal/entrance/hotel/external/transport create.

## 5. Risks
- **Determinism must hold** — confirm `GUIDE_RATES` resolution is a pure function of `guideType`/`guideDuration`
  (no date/FX/DB variance); if any variance exists, the post-write compare would (correctly) fail closed with
  `rate_changed`, but the happy path should be Δ0.
- **Guide-compat guard** — `resolveQuoteItemValues` throws when `guideType !== undefined` on a non-guide item; the
  create path must set `guideType` only for guide items (branch cleanly).
- **Guide identity** — `serviceId` must be a guide-type SERVICE (`/api/services`), not a person (`/api/guides`); reject
  a mismatched service type up front.
- **Cross-type token replay** — bind the token to the item type so an activity create-preview token cannot be applied
  as a guide create (and vice-versa).
- **Scope creep** — keep it GUIDE-only; no other create types this slice.
- No prod enablement / staff / live in this slice.

## 6. Implementation slice proposal (for a later code PR, after approval)
- **Backend:** branch `resolveContext` + `buildCreateInput` in `quote-experiences-v2.service.ts` for `itemType='guide'`
  (validate guide-type service + guideType/duration; build the guide `createItem` payload with
  `guideType`/`guideDuration`/`guideOvernight` + `GUIDE_DEFAULT_MARKUP`); extend/scope the token kind; keep the guard,
  compensation, audit, and response redaction unchanged. Reuse `QUOTE_ITEM_CREATE`.
- **Frontend:** add-guide preview→confirm UI in the experiences step behind the existing NEXT_PUBLIC flag; `/api/services`
  guide-type picker.
- **Flags:** unchanged (reuse `QUOTE_ITEM_CREATE` + `NEXT_PUBLIC_QUOTE_BUILDER_V2_ITEM_CREATE`); prod stays OFF.

## 7. Test plan
See §3.8. Backend determinism + guard + validation + audit + redaction unit tests, existing activity suite unchanged,
plus a staging synthetic guarded validation with cleanup (project-ID-pinned; hard-fail identity guard before any DB
write).

## 8. GO / NO-GO
- ✅ **GO** — build **add-guide** create as the next slice (guarded path, existing flags, prod OFF, staging-validated).
- ⛔ **NO-GO** — meal / entrance / hotel / external / transport create (out of scope; non-deterministic or side-effectful).
- ⛔ **NO-GO** — merging PR #604 as-is (predates the guard).
- ⛔ **NO-GO** — production item-create enablement, staff rollout, live bookings, supplier send, full no-Classic launch.

## 9. Standing state
- ERP V2 remains **build-mode**.
- **Classic remains the system of record.**
- **Production item-create remains OFF** (`QUOTE_ITEM_CREATE` absent on prod).
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

### Safety confirmations
- Read-only inspection only — no code, schema, flag/env, or data change was made. No production or staging touched.
- No secrets, DB URLs, or token values recorded — only route/field/flag/constant names and file paths.
