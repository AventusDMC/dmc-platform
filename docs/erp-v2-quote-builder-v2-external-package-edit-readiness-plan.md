# ERP V2 — E-0: External Package Commercial Edit — Readiness Plan

**Status: readiness plan (doc-only, read-only).** No code, schema, flags, env, pricing, staging, or production changes. Assesses **only** a narrow, **finance-only, DRAFT-only** commercial edit of `external_package` items. Authorizes **no** implementation. Classic remains the system of record; ERP V2 remains build/test only; production item-mutation remains OFF.

**Verdict up front: CONDITIONAL GO — to a read-only E-a prerequisite check only.** GO conditional on E-a proving the named evidence in §15 (matrix-less determinism, `serviceId` stays null, markup stays the constant default, a single audit contract, and the SLAB quote-total caveat handled). If any fails → **NO-GO**. **Candidate commercial allowlist = `netCost` + `pricingBasis` only.**

Facts are cited `file:line` and marked **[FACT]**; recommendations **[REC]**; decisions for Ziad **[DECISION]**.

---

## 1. Purpose and current boundary

- **[FACT]** Guarded V2 create + delete are complete for `activity`, `guide`, `meal`, `entrance`, `external_package` (create M-1…M-3 #840–#844; delete D-0…D-b #845–#849).
- **[FACT]** External Package already has **pricing-inert display-text editing** — `updateItemDisplayText` (`apps/api/src/quotes/quotes.service.ts:6465`, route `quotes.controller.ts:1569`) whitelists `externalClientDescription`/`externalIncludes`/`externalExcludes`/`externalHotelsOrSimilar` (+`transportLabel`); FE `DisplayTextEditor` on external rows (`experiences-step.tsx:214/348`; `quote-v2-adapter.ts:1269`).
- **[FACT]** V2 exposes **no guarded commercial-edit route** — `quote-experiences-v2.controller.ts` has create/delete only.
- **[FACT/DECISION]** The generic Classic `updateItem` PATCH (`quotes.controller.ts:1338`) is **not** automatically approved for V2 (it can change any field, always re-prices, writes no audit).
- E-0 assesses **only** a narrow External Package commercial edit. Hotel-delete is closed NO-GO (#850/#851); the shared five-type edit is rejected.
- Classic remains the system of record; ERP V2 build/test only; production item-mutation OFF.

## 2. Why External Package is first **[FACT]**

- External Package pricing originates from a **manually supplied `netCost`** (`quotes.service.ts:7769–7775`, required); the one-off branch persists `serviceId null` (create sends none).
- **No live catalog-rate lookup**: `baseCost = matrixCostBasis ?? netCost` (`quotes.service.ts:7821–7823`) — for a flat (matrix-less) package, `baseCost = netCost`, a pure input.
- **No service identity to swap** (service-less; `serviceId null`).
- **Deterministic** repricing when the complete required payload is supplied (no catalog/live rate).
- Its **create flow is finance-only and validated end-to-end** (M-3a/M-3b; staging + live).
- Contrast: **activity** re-reads live `ActivityRateVariant.costPrice` (`quotes.service.ts:7675`); **entrance** re-reads live ticket/fee + live Jordan-Pass coverage (`:7705/7707`) → non-deterministic. **Meal** has a persisted-unit-cost fallback gap (`:3457`/`:7734`). A shared five-type edit would therefore be unsafe and oversized.

## 3. Field taxonomy and proposed allowlist

**[FACT]** External Package fields (create → resolver → persisted) and their classification:

| Field | Class | Editable via this slice? |
|---|---|---|
| `netCost` (`externalNetCost`) | **Commercial** | **YES (candidate)** — deterministic input (`:7769/7821`) |
| `pricingBasis` (`externalPricingBasis`, PER_PERSON/PER_GROUP) | **Commercial** | **YES (candidate)** — deterministic multiplier (`:7766/7827`) |
| `externalClientDescription` | Existing display-text | No — stays on `updateItemDisplayText` |
| `externalIncludes` / `externalExcludes` / `externalHotelsOrSimilar` | Existing display-text | No — stays on `updateItemDisplayText` |
| `packageName` (`externalPackageName`) | Operational metadata | **No** — not moved into the commercial endpoint for convenience |
| `country` (`externalPackageCountry`) | Operational metadata | **No** — immutable in V2 for now |
| `currency` | Commercial-adjacent (FX risk) | **No** — immutable initially (FX not proven no-op; `:8026`) |
| `markupPercent` | Pricing input | **No** — a **hardcoded constant** in create (`quote-experiences-v2.service.ts:510/554/566` = `EXPERIENCE_DEFAULT_MARKUP`), not a user field |
| `sellPrice` override | Pricing override | **No** — not part of the validated External Package create contract |
| Quantity/pax | Pricing input | **No** — pax derives from the quote; not an external field |
| `serviceDate` | Operational | **No** — immutable (excluded) |
| Day assignment (`QuoteItineraryDayItem.dayId`) | Operational | **No** — move/reorder is a separate future track |
| `externalSupplierName` | Internal/supplier | **No** — never editable/leaked here |
| `externalInternalNotes` | Internal | **No** |
| `pricingMatrixJson` / `singleSupplement` | Pricing structure | **No** — out of scope; slice restricted to matrix-less packages (§6) |
| `serviceId` / item type / classification metadata | Immutable identity | **No** — must be rejected (§7) |

**[REC] Smallest safe allowlist: `netCost` + `pricingBasis`.** Descriptive fields remain on the existing display-text endpoint; currency, markup, sell-override, packageName, country, description, quantity, day, date, identity, supplier, and internal fields remain immutable in this slice.

## 4. Existing update and apply infrastructure **[FACT]** (what to reuse vs wrap)

- **Classic generic PATCH** `@Patch(':id/items/:itemId')` → `updateItem` (`quotes.service.ts:3296/3316/3330`): re-prices via `resolveQuoteItemValues`, recalcs, **no audit**. **Must NOT be exposed directly in V2.**
- **Guarded `applyPreviewQuoteItem`** (`quotes.service.ts:4161`, route `quotes.controller.ts:1468`): dual-flag gate (`:4172`), signed preview token + `exp` (`:4190`), quote/item/company binding (`:4199`), **payload-hash-must-equal-preview** `payload_mismatch` (`:4203`), snapshot re-derivation `stale_preview`+`mismatchField` (`:4309`), non-zero delta → `confirmation_required` unless `acknowledgedDelta` (`:4324`), delegates to `updateItem` (`:4336`), post-write integrity compare, audit `quote.pricing.apply` (`:4374`). **External Package is in the set that blocks `serviceId` swaps** (`:4288`).
- **Preview token / hashing / snapshot** helpers are shared (create + delete reuse them).
- **Admin-web proxies** + External Package create/apply/display-text FE actions exist.
- **[REC]** Reuse the **token/hash/snapshot/resolver/recalc/audit internals**; wrap them behind a **narrow V2 external-edit API contract** with a strict allowlist — do not surface the generic PATCH.

## 5. Proposed guarded operation (design options, not a selection) **[REC]**

- **Option 1 — reuse the existing pricing-apply routes with a strict External Package payload.** Least new surface, but overloads a Classic route and its role set (admin/operations) — wrong for a finance-only slice.
- **Option 2 (preferred) — add V2-scoped external-edit preview/apply routes** (e.g. `POST /quotes/:id/v2/experiences/item/:itemId/edit/preview` + `POST …/item/:itemId/edit`) that **reuse the existing token, resolver, snapshot, and audit internals** but enforce the finance gate + `netCost`/`pricingBasis` allowlist + external-only eligibility. Keeps the V2 contract narrow and the Experiences delete/create surface untouched.

**Proposed flow:** (1) load + positively classify the item as `external_package`; (2) confirm finance role; (3) confirm DRAFT + `acceptedVersionId==null` + latest revision + editable; (4) accept **only** `netCost`/`pricingBasis`; (5) reject identity/supplier/service/type/date/day/currency/unknown fields; (6) re-resolve via the **unchanged** resolver; (7) return current/projected totals + deltas (cost finance-only); (8) require `acknowledgedDelta` when selling changes; (9) bind the token to quote+item+company+payload-hash+snapshot; (10) apply the exact previewed payload; (11) recalc via existing logic; (12) write a sanitized audit row; (13) return a narrow response.

## 6. Pricing determinism **[FACT]** — the GO/NO-GO crux

- **`netCost`** → `baseCost = matrixCostBasis ?? netCost` (`quotes.service.ts:7821–7823`). **[FACT]** For a **matrix-less** package (`pricingMatrixJson == null`, which is the V2 create shape — flat net cost only), `baseCost = netCost` deterministically. **[FACT, caveat]** If a matrix is present, the matrix **overrides** netCost → a netCost edit is a **no-op on cost**. **[REC]** the slice must be **restricted to matrix-less packages**; matrix packages stay Classic-only for edit (or the prereq confirms how to surface that).
- **`pricingBasis`** → PER_PERSON multiplies by pax; PER_GROUP is flat (`:7827`). Pax derives from the quote. Deterministic multiplier.
- **Markup** is the constant `EXPERIENCE_DEFAULT_MARKUP` (not edited); sell = cost × (1+markup). Deterministic.
- **Currency** — excluded, so no FX (`:8026`). If ever included, FX determinism must be separately proven.
- **SLAB** — `recalculateQuoteTotals` sums persisted line totals **except SLAB mode**, where quote `totalSell` is slab-driven (`quotes.service.ts:10826`). **[FACT, caveat]** In a SLAB quote, an external line's sell change may not move the quote `totalSell` → the quote-total projection is not a simple sum-of-line-deltas. The **line** preview/apply parity still holds; the prereq must decide how the preview presents quote-level totals under SLAB.
- **Jordan-Pass sync** (`:10710`) affects **entrance** items only → no effect on external package.
- **Preview/apply parity:** because the resolver is pure and re-derives from the same inputs, and the token binds the payload-hash + snapshot, **preview and apply produce identical results when the snapshot is unchanged**; drift → `stale_preview`/`rate_changed`. **No new arithmetic is introduced.**

## 7. Eligibility and immutable identity **[REC]**

- Positive predicate: `Boolean(item.externalPackageName)` (service-less external marker) **and** `serviceId == null` **and** matrix-less — reclassified at **both** preview and apply.
- Preserve the hotel/transport denylist; unclassified rows fail closed (`item_not_removable`-style → an edit-analogue `item_not_editable`).
- `serviceId` must remain null/unchanged (the external apply path already blocks `serviceId` swaps, `:4288`).
- No activity/guide/meal/entrance/hotel/transport item may enter this route; no edit may transform the type; legacy/conflicting rows fail closed.

## 8. Permissions and redaction **[FACT/REC]**

- **[FACT]** Repository finance semantics: `canViewQuoteCostMargin` → cost-visible roles = `admin`, `super_admin`, `finance` (`apps/api/src/auth/cost-visibility.ts`); the external-package **create** slice is finance-only via this predicate.
- **[REC]** This edit slice is **finance-only** (same predicate). `viewer`/`agent` blocked at the route; `operations` and `agent_admin` fail closed **before** any net-cost data is returned (external edit exposes cost, unlike delete). Preview/apply return selling only to any non-finance caller (moot — non-finance blocked). Never leak `externalNetCost`/`externalSupplierName`/`externalInternalNotes`/supplier rates/cost/margin to non-finance; no raw token/snapshot internals in the FE; narrow response shapes; no supplier/contract/rate/credential/session/PII exposure.

## 9. Feature-gate design **[REC]**

- Options: reuse `QUOTE_ITEM_CREATE`; reuse the pricing-apply gates; or a dedicated external-edit gate.
- **[REC]** a **dedicated OFF-by-default external-edit gate** (backend + `NEXT_PUBLIC_` frontend) is the most fail-closed choice, decoupling edit rollout from create/apply. **No gate changes in E-0.** Any future production gate defaults OFF; staging enablement needs separate approval; existing production pricing flags (`QUOTE_PRICING_EXTERNAL_PACKAGE_APPLY` etc.) must **not** implicitly enable editing; production item-mutation stays OFF.

## 10. Audit design **[DECISION/REC]**

- **[FACT]** `updateItem` writes no audit; `applyPreviewQuoteItem` writes `quote.pricing.apply`; create/delete write `quote.item.created`/`quote.item.removed`.
- **[REC]** Emit **one** action — **`quote.item.updated`** — for the V2 external edit (consistent with the create/delete naming; avoids ambiguity with the generic pricing-apply). Do **not** emit both.
- Metadata (sanitized, server-side only): quoteId, itemId, itemType, dayId, **changed-field names**, currency, **sanitized cost/selling deltas** (finance-policy gated), actor + timestamp via the normal audit framework. **Never** store full request bodies, supplier names, internal notes, credentials, tokens, snapshot internals, or PII.

## 11. Validation and error contract **[REC]**

Typed codes → safe FE copy (no internals): `item_not_found`, `item_not_editable`, `not_external_package`, `quote_not_editable`, `stale_revision`/accepted, `external_package_finance_only` (finance required), `invalid_field`/unknown-field rejected, `immutable_field` attempt, `invalid_pricing_basis`, `invalid_external_package_cost`/missing netCost, `currency_immutable`, `invalid_preview_token` (invalid/expired/replayed), `payload_mismatch`, `stale_preview`/`rate_changed`, `confirmation_required`.

## 12. Backend test plan (to define later) **[REC]**

Positive external classification; other four types rejected; hotel/transport/unclassified rejected; finance allowed, non-finance blocked; DRAFT-only; accepted/versioned/booked blocked; strict `netCost`/`pricingBasis` allowlist; unknown fields rejected; identity/service/supplier/day/date/currency mutation rejected; netCost happy path; pricingBasis happy path; current/projected totals; SLAB + quote-total behavior; preview/apply parity; stale/tampered/replayed token; payload mismatch; concurrent quote change → `rate_changed`; redaction/leak guard; audit `quote.item.updated`; transaction rollback/atomicity; **no pricing-math change** assertion (`resolveQuoteItemValues`/`recalculateQuoteTotals` untouched); no Accept/booking/invoice/public-link/voucher/packet/supplier-send/email side effects.

## 13. Frontend plan (to define later) **[REC]**

A narrow external commercial-edit affordance: visible only when the gate is enabled and only on eligible external rows; **finance-only**; **separate** from the display-text editor; prepopulates only `netCost`/`pricingBasis`; shows current + projected **selling** totals (cost only where finance policy permits); explicit confirm; cancel without applying; safe success/error feedback; `router.refresh()` on success; never exposes supplier/internal fields. No FE implementation authorized now.

## 14. Staging-validation plan (to perform later) **[REC]**

Staging only, project-ID-pinned + hard guard; verify deployment/flags before writes; confirm baseline; **never edit the retained evidence item** (`4beecd88…`); create **one** temporary external package via the validated create flow; preview a controlled `netCost`/`pricingBasis` edit; confirm projected cost/selling; apply with the preview token; confirm final values/totals/audit/redaction; confirm no unrelated item changed; **delete the temporary item** via the validated remove flow → net-zero; no Accept/booking/invoice/public-link/voucher/packet/supplier-send/email; no production. Close the deployed-frontend gap **live** (as required for D-b). Do not validate during E-0.

## 15. GO / NO-GO criteria

**Return NO-GO** if any remain unresolved: external package cannot be classified positively/exclusively; the `netCost`/`pricingBasis` allowlist cannot be strictly enforced; preview/apply cannot reproduce identical results; the resolver would need new pricing math; currency or pricing-basis behavior is ambiguous; non-finance could access net cost/internal data; identity/service/supplier/date/day could change; the route could admit another type; DRAFT-only is unclear; audit cannot be sanitized; a schema/migration is required; a safe net-zero staging fixture cannot be established.

**Recommendation: CONDITIONAL GO** — to a **read-only E-a prerequisite check**, conditional on E-a proving: (1) **matrix-less determinism** (edit restricted to `pricingMatrixJson == null`; matrix packages stay Classic-only); (2) `serviceId` stays null and no identity change is possible; (3) markup stays the constant default (not editable); (4) a single **`quote.item.updated`** audit contract; (5) the **SLAB quote-total projection caveat** is handled in the preview. If any fail → **NO-GO**. **This plan authorizes no backend/frontend implementation.**

## 16. Proposed PR sequence **[REC]**

1. **E-0** readiness plan (this doc).
2. **E-a** read-only prerequisite confirmation (§15 conditions).
3. **E-a** backend guarded preview/apply (only if GO; reuse existing internals; flag OFF prod).
4. **E-a** backend staging validation.
5. **E-a** backend validation documentation.
6. **E-b** frontend commercial-edit affordance.
7. **E-b** live frontend staging validation.
8. **E-b** validation documentation.
Every code PR requires validation before the next slice.

## 17. Explicit exclusions

Shared five-type edit; activity/guide/meal/entrance edit; hotel/transport/unclassified edit; move/reorder; day/date changes; identity/type/service/supplier changes; currency changes (unless separately proven + approved); display-text/proposal-mapper changes; new pricing formulas; schema/migrations; catalog/supplier/contract/rate writes; production access or rollout; staff rollout; live bookings; Accept/invoice/booking/conversion/public link/voucher/packet/supplier-send/email; Classic changes.
