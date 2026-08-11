# ERP V2 — Quote Builder V2 Meal Create Readiness Plan

Planning / read-only inspection. No code, schema, flag, env, or data changes. Classic remains the system of record. Meal create implementation is **not** started.

**Goal:** plan the safest next Quote Builder V2 create-item slice — **Meal create** — reusing the existing guarded item-create architecture with no new pricing math.

## 1. Current inventory

- **Meal preview/apply is live** through the shared engine (recognized by `isMealService`; apply is the thin guard → `updateItem` → `recalculateQuoteTotals`, no meal-specific write fork).
- **Meal create is Classic-only today.**
- **V2 item-create currently accepts `activity` / `guide` only** — the V2 route `POST /quotes/:id/v2/experiences/item` (`quote-experiences-v2.service.ts:resolveItemType`) rejects anything else with `out_of_scope`.
- **Meal pricing already exists** in `resolveQuoteItemValues` (`quotes.service.ts:7732-7752`), used by both Classic and V2 `createItem`.
- **No pricing-math change is needed** — meal create is threading `itemType: 'meal'` through the existing V2 orchestration + a frontend panel.
- **Flag state (read-only, confirmed):** `QUOTE_ITEM_CREATE` is **staging ON, production OFF/unset**; `NEXT_PUBLIC_QUOTE_BUILDER_V2_ITEM_CREATE` is on staging Vercel only.

## 2. Required fields

- `serviceId` — **required**: a real `SupplierService` whose taxonomy resolves to `meal`.
- `customServiceName` — **required**: the meal name.
- `unitCost` — optional (defaults to `service.baseCost`; must be finite ≥ 0).
- `currency` — optional (defaults to the service currency).
- `paxCount` — optional (defaults to `quote.adults + quote.children`).
- `dayId` (itinerary day) + `serviceDate`.
- `quantity` = 1.
- `PER_PERSON` basis.
- **No catalog rate table / no rate variant.**

## 3. Pricing source

- **Manual unit cost + markup** — no meal rate table.
- `baseCost = costBaseAmount = unitCost ?? service.baseCost` (defaults to `service.baseCost`).
- The generic catalog-rate path is **excluded** for meals (`isGenericServiceRateEligibleService` returns false for meal).
- Sell = `totalCost × (1 + markupPercent/100)`.
- The **SupplierService `unitType`** (`per_person`) drives the per-person multiplication — not a meal-specific basis flag.

## 4. Frontend design

- **`AddMealPanel`** (mirrors `AddGuidePanel` in `experiences-step.tsx`).
- **Day** select.
- **Service date** (auto-filled from the day).
- **Meal service** select (from `/api/services`, filtered by a new `isMealService` client predicate mirroring `isGuideService`).
- **Meal name** → `customServiceName` (free text, required).
- **Finance-gated unit-cost override** — rendered only for `canAccessFinance` (admin/super_admin/finance) roles.
- **Operations create at the service base cost** (no cost field, never see/enter cost).
- **Same Preview → Confirm flow** and the same shared `onPreviewAddItem`/`onAddItem` handlers + proxies.
- **Selling price only** shown in preview (no cost/margin).
- Generalize the hard-coded "Activity added successfully" toast to the item type.

## 5. Backend design

- **Extend `quote-experiences-v2`** to accept `itemType: 'meal'` (no new route, no forked pricing).
- `resolveItemType` → include `meal`.
- Controller `AddItemBody` + `toInput` → support meal fields (`serviceId` reused, `customServiceName`, `unitCost`, `currency`).
- `resolveContext` → meal branch: require `serviceId` + `customServiceName`, load the `SupplierService`, assert `resolveServiceTaxonomyGroup === 'meal'` (else `not_meal_service`).
- `buildCreateInput` → meal payload (`serviceId, itineraryId, serviceDate, customServiceName, unitCost, currency, quantity: 1, markupPercent, PER_PERSON`).
- Add **`MEAL_CREATE_TOKEN_KIND = 'v2-meal-create'`**; extend `tokenKindForItemType`.
- **Token identity binds** `serviceId` / `customServiceName` / `unitCost` / `currency` (a changed cost invalidates the token; cross-type replay stays blocked).
- `createItem` / `recalculateQuoteTotals` / audit `quote.item.created` / `confirmation_required` / stale-preview / `rate_changed` guards remain **unchanged**.

## 6. Redaction / privacy

- No cost/margin to non-finance (`canViewQuoteCostMargin`); preview/create echoes show **selling price only**; audit records true cost server-side.
- **Unit-cost field is finance-gated** (`canAccessFinance`).
- **Operations never see or enter cost** — they create at the service base cost.
- No supplier rates, raw services, PII, or internal notes surfaced.
- **Meal name is the only free-text field** (already a supported column).

## 7. Risks

- **Meal default markup must be confirmed.** No `MEAL_DEFAULT_MARKUP` constant exists (only HOTEL 15, EXPERIENCE 20, GUIDE 20); Classic takes meal markup from the form.
  - **Recommendation:** use `EXPERIENCE_DEFAULT_MARKUP` (20) as the interim V2 default for parity with Activity/Guide, unless the team confirms a dedicated `MEAL_DEFAULT_MARKUP`.
- **Verify meal-taxonomy `SupplierService` rows exist** (read-only) before implementation; if none, the panel is empty and meal stays Classic-only.
- **Unit-cost field must not leak to operations** — finance-gating is mandatory and must be tested.
- Source-grep tests are fragile to string changes.
- The token/drift guard must be **meal-bound** to prevent cross-type replay.
- **Prod remains OFF** — all changes flag-gated; no rollout implied.

## 8. Test plan

**Backend:**
- meal accepted / unknown itemType rejected.
- `serviceId` + `customServiceName` required.
- non-meal service rejected (`not_meal_service`).
- meal create payload shape (PER_PERSON, quantity 1, markup).
- token kind isolation (meal token can't create activity/guide, and vice-versa).
- `confirmation_required` on non-zero delta.
- `rate_changed` compensation on post-write drift.
- cost redaction for non-finance on preview/create echoes.
- `feature_disabled` when the flag is OFF.
- audit `quote.item.created` with meal fields.

**Frontend:**
- `AddMealPanel` source-grep test (`builder-v2-add-meal-preview-confirm.test.ts`, registered in `package.json`).
- finance-gated unit-cost field.
- no cost/margin shown in preview (negative assertion); `itemType: "meal"` + `customServiceName` payload; `/api/services` + `isMealService` filter; reuse of shared handlers/proxy/flag.

**Regressions:**
- existing add-activity / add-guide / meal-apply / cost-redaction suites stay green; `tsc` baselines (api 16 / admin-web 9) unchanged.

## 9. GO / NO-GO

**GO**
- Extend the V2 `quote-experiences-v2` orchestration to accept `meal`.
- Add `AddMealPanel`.
- Reuse the existing `QUOTE_ITEM_CREATE` + `NEXT_PUBLIC_QUOTE_BUILDER_V2_ITEM_CREATE` flags.
- Prod remains OFF.

**NO-GO**
- New pricing math.
- `createItem` / `recalculateQuoteTotals` changes.
- Catalog / rate / service edits.
- A new flag.
- Exposing cost/margin to non-finance.
- Accept / invoice / booking.
- Supplier-send / voucher-send.

## 10. Exact next implementation slice

**Slice M-1 — V2 Meal create.**
- Full-stack, mirroring the Guide slice.
- **Backend:** the `meal` arm in `quote-experiences-v2` (`resolveItemType`, `resolveContext` with `not_meal_service` guard, `buildCreateInput`, `MEAL_CREATE_TOKEN_KIND` + `typeMatches`, controller body fields); reuse `createItem` unchanged; interim markup = `EXPERIENCE_DEFAULT_MARKUP` **pending team confirmation**.
- **Frontend:** `AddMealPanel` (meal-service select via `isMealService`, required meal name, finance-gated unit-cost override), reuse handlers/proxy/flag, generalize the toast, add the source-grep test.
- **Existing flags only** (prod OFF).
- **Confirm meal-taxonomy services and the default markup first.**
- Can be split **M-1a (backend) / M-1b (frontend)** if a smaller first PR is preferred; the Guide precedent shipped full-stack.
