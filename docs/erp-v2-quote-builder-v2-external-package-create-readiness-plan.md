# ERP V2 — Quote Builder V2 External Package Create — Readiness Plan

**Status: PASS (planning / read-only).** This is a design-and-inventory plan only. No code, no schema, no flags, no data. It defines the safest next Quote Builder V2 create-item slice — **External Package create** — and reuses the existing guarded item-create architecture (preview → confirm → token → drift → shared `createItem` → recalc → audit) with **no pricing-math change**. Classic remains the system of record; production item-create remains OFF.

**Verdict up front:** GO, as the narrowest, **finance-only, one-off (service-less), flat-net-cost** create slice yet. External Package differs from Activity/Guide/Meal/Entrance because its price is a **manual, required cost input with no catalog fallback** — which forces finance-only access and a no-service-picker one-off path.

---

## 1. Current inventory

| Capability | State today | Evidence |
|---|---|---|
| **Classic external package create** | Exists — manual create via `resolveQuoteItemValues` external branch (`quotes.service.ts:7754–7846`); Classic form `QuoteItemsForm.tsx` + `external-package-ui.ts` (`buildExternalPackagePayload`). | Classic path |
| **V2 external package preview** | Exists — PR #571, flag `QUOTE_PRICING_EXTERNAL_PACKAGE_PREVIEW` + `NEXT_PUBLIC_..._EXTERNAL_PACKAGE_PREVIEW`. Read-only projection. | `quotes.service.ts:3772–3785` |
| **V2 external package apply** | Exists — PR #590, flag `QUOTE_PRICING_EXTERNAL_PACKAGE_APPLY` + `NEXT_PUBLIC_...`. Re-prices only the package line in place. | `quotes.service.ts:4239–4296` |
| **V2 external package create** | **Does not exist.** No add panel; the V2 create route's controller whitelist drops all external fields. | `quote-experiences-v2.controller.ts:72–95` |
| **V2 item-create (other types)** | Activity, Guide, Meal, Entrance/Ticket already supported through the guarded orchestration. | `quote-experiences-v2.service.ts` |

Key facts:
- The existing V2 create route (`POST /quotes/:id/v2/experiences/item[/preview]`) currently **drops external fields** — its `AddItemBody`/`toInput` whitelist has no external keys.
- The external-package **preview/apply flags are separate** and are **not** create gates.
- Create should be gated by **`QUOTE_ITEM_CREATE` only** (the shared item-create flag).
- **Production item-create remains OFF.**

## 2. Refined core decision

- External Package create is **finance-only**.
- External Package create is **one-off / service-less** for this slice.
- **No service picker.**
- **No catalog `SupplierService` prerequisite.**
- **No `externalPackage`-taxonomy service requirement** for this first create slice.
- **Flat net cost only.**
- **No pricing matrix.**
- **No single supplement.**
- **No multi-day package range editing.**
- **No multi-country external package subsystem** (`dmc_external_package_quotes` / `DmcExternalPackageRequest` are unrelated and out of scope).

Basis: the resolver's structural detection (`hasExternalPackageFields = packageName || country || netCost !== undefined`) plus a synthetic non-UUID `serviceId` triggers `isOneOffExternalPackage`, which builds a synthetic `EXTERNAL_PACKAGE` service in memory (`quotes.service.ts:6975–6980, 7047, 9961–9984`). Real external packages "usually have NO linked SupplierService"; one-off items persist `serviceId: null`. So create works **directly from the manual fields** with no catalog dependency.

## 3. Required fields

**Hard-required (resolver throws if missing):**
- `netCost` — required.
- `currency` — required.
- `country` — required.
- `clientDescription` — required.

**Optional:**
- `packageName` (falls back to clientDescription/country).
- `pricingBasis` — `PER_PERSON` / `PER_GROUP`.
- `includes`.
- `excludes`.
- `hotelsOrSimilar`.
- `internalNotes`.

**From the existing item-create flow:**
- `serviceDate` / itinerary `day` — via the same day-linked path as other item types.
- **No `serviceId` required** for the one-off path.

## 4. Pricing source

- **Manual `netCost`.**
- **No catalog rate.**
- **No fallback service `baseCost`** (unlike Meal/Entrance, which fall back to catalog cost).
- `markupPercent` **defaults to 0** unless entered/confirmed otherwise (`quotes.service.ts:7860`; there is no external-specific markup constant).
- **Flat net cost only** (matrix deferred).
- The **existing resolver** already handles one-off external-package fields (`baseCost = matrixCostBasis ?? netCost`, `quotes.service.ts:7821–7823`).
- **No pricing-math change.**

## 5. Why finance-only

- `netCost` is required.
- `netCost` is **cost data**.
- Operations cannot create external packages without entering cost.
- Cost redaction (`canViewQuoteCostMargin` → `admin`/`super_admin`/`finance`) forbids operations entering/seeing net cost.
- Non-finance must **fail closed** with the typed code **`external_package_finance_only`**.

This mirrors the meal `cost_override_forbidden` pattern, except here the cost is the whole item, so the **entire create** is finance-gated (not just an optional override).

## 6. Backend design

- Extend `quote-experiences-v2` to accept `itemType = external_package` in `resolveItemType`.
- Add `EXTERNAL_PACKAGE_CREATE_TOKEN_KIND = 'v2-external-package-create'` (per-type kind, so an external token can create nothing else).
- Controller `AddItemBody` / `toInput` must allow the external fields:
  - `netCost`
  - `currency`
  - `country`
  - `clientDescription`
  - `packageName`
  - `pricingBasis`
  - `includes`
  - `excludes`
  - `hotelsOrSimilar`
  - `internalNotes`
- `resolveContext` validates **finance access** (fail closed `external_package_finance_only` for non-finance).
- Validate the required fields (netCost/currency/country/clientDescription).
- `buildCreateInput` maps the **one-off external package payload** (external fields + `startDate = serviceDate`).
- `serviceId` is **optional / omitted** for the one-off path.
- `tokenIdentityFor` binds:
  - `netCost`
  - `currency`
  - `country`
  - `clientDescription`
  - `pricingBasis`
  - `packageName` (if included)
- `createItem` / recalc / audit / preview-token guards **unchanged** (stale_preview, confirmation_required, rate_changed + compensating removeItem, audit `quote.item.created`).

## 7. Frontend design

- New `AddExternalPackagePanel` in `experiences-step.tsx`, beside the existing add panels.
- Panel visible **only for finance-visible roles**: `admin`, `super_admin`, `finance`.
- **Not visible for `operations`.**
- Fields:
  - day
  - serviceDate
  - netCost
  - currency
  - country
  - clientDescription
  - pricingBasis
  - optional packageName
  - optional includes / excludes
  - optional hotelsOrSimilar
  - optional internalNotes
- **No service picker.**
- **No cost field for operations** — because operations never see the panel at all.
- **Preview → Confirm** flow (reuses the shared `onPreviewAddItem` / `onAddItem` handlers).
- **Selling price only** in preview/confirm (cost/margin never rendered).
- **No new proxy** (reuses `/api/quotes/[id]/v2/experiences/item[/preview]`).
- **No new flag** (reuses `NEXT_PUBLIC_QUOTE_BUILDER_V2_ITEM_CREATE`).

Payload: `{ itemType: "external_package", dayId, serviceDate, netCost, currency, country, clientDescription, pricingBasis, ...optional text }` — **no `serviceId`**.

## 8. Redaction / privacy

- `externalNetCost` must **not** be exposed to non-finance.
- `externalInternalNotes` must **not** be exposed in the V2 preview/create response.
- `externalSupplierName` must **not** be exposed unless explicitly safe (this slice omits it from the form entirely).
- The create/preview response remains **narrow** (itemId / itemType / dayId / cost / sell / currency / quote totals).
- **No raw external-package object** returned.
- **No supplier rates.**
- **No PII.**
- Audit stores the **true cost server-side only** (sanitized metadata).
- **Add tests** asserting the create/preview response never returns:
  - `externalNetCost`
  - `externalInternalNotes`
  - `externalSupplierName`

Note: today's redaction is enforced by the adapter (`quote-v2-adapter.ts:1273–1276`) and the proposal mapper (`proposal-v3.mapper.ts` — no cost fields), not by a single raw-payload scrubber. The V2 create/preview response is already a narrow projection; the new tests make that guarantee explicit for this slice.

## 9. Classic-only scope (excluded from this slice)

- Pricing matrix JSON.
- Single supplement.
- Tiered pricing.
- Complex multi-day range editing.
- Editing / removing / re-pricing existing external packages (apply already handles re-price under its own flag).
- The separate multi-country external package module.
- Any catalog / service edits.
- Operations-accessible external package create.

## 10. Flags

- Reuse **`QUOTE_ITEM_CREATE`** (backend).
- Reuse **`NEXT_PUBLIC_QUOTE_BUILDER_V2_ITEM_CREATE`** (frontend).
- **No new flag.**
- **Production item-create remains OFF.**

## 11. Risks

- **Cost-in-UI risk** — mitigated by finance-only panel + service-level fail-closed gate.
- **Finance-only gate must be strict** — enforced in the service, not merely by hiding the panel.
- **Required-field UX** — four hard-required fields; clear inline validation; `canSubmit` guards all four.
- **Markup default ambiguity** — default 0 at-cost; confirm the intended policy in the prereq check.
- **Matrix / supplement scope creep** — explicitly deferred; flat net cost only.
- **Baseline test drift** — follow the established source-grep-scoping discipline.
- **Response redaction** — must explicitly assert no internal external fields leak.

## 12. Test plan

**Backend:**
- `resolveItemType` accepts `external_package`.
- Unknown item type rejected (`out_of_scope`).
- Non-finance rejected with `external_package_finance_only`.
- Finance actor accepted.
- Missing `netCost` rejected.
- Missing `currency` rejected.
- Missing `country` rejected.
- Missing `clientDescription` rejected.
- Flat `PER_PERSON` create payload.
- Flat `PER_GROUP` create payload.
- Markup default 0.
- Token kind `v2-external-package-create`.
- Cross-type replay blocked (an external token cannot create another type, and vice-versa).
- Changed `netCost` invalidates token.
- Changed `currency` invalidates token.
- Changed `country` / `clientDescription` invalidates token.
- `confirmation_required` (non-zero delta).
- `stale_preview` (quote moved since preview).
- `rate_changed` (post-write drift + compensating removeItem).
- Response does **not** expose `externalNetCost` / `externalInternalNotes` / `externalSupplierName`.
- No pricing resolver / `createItem` / recalc changes.

**Frontend:**
- `AddExternalPackagePanel` renders only for finance-visible roles.
- Panel hidden for operations.
- Payload includes `itemType: "external_package"`.
- Payload includes the required fields.
- Payload does **not** include `serviceId`.
- No service picker.
- No new proxy.
- Preview → Confirm flow.
- Selling price only.
- Error mapping (typed codes).
- Existing Activity / Guide / Meal / Entrance tests remain green.

## 13. GO / NO-GO

**GO**
- Finance-only, one-off, flat-net-cost external package create.
- Reuse the existing guarded architecture.
- Existing item-create flags only.
- Production item-create remains OFF.

**NO-GO**
- Operations-accessible external package create.
- Pricing matrix / single supplement.
- New pricing math.
- Resolver / `createItem` / recalc changes.
- New flag.
- Supplier-send / voucher-send.
- Accept / invoice / booking.
- Staff rollout / live bookings.
- Full no-Classic launch.

## 14. Exact next implementation sequence

1. **M-3 prereq check** (read-only):
   - Confirm external package **markup policy**: default 0 at-cost, or another agreed markup.
   - Confirm the finance-only **error code**: `external_package_finance_only`.
   - No catalog service prerequisite required (one-off path).
2. **M-3a — backend External Package create support** (backend only; flag OFF in prod).
3. **M-3b — frontend `AddExternalPackagePanel`** (frontend only; existing flag).
4. **Staging validation** (backend, then frontend).
5. **Doc reports** (backend validation, frontend validation).
