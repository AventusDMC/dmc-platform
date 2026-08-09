# ERP V2 — Hotel Contract/Rate Read-Only Detail Plan

Planning document. No code, no behavior change. Plans a safe, read-only hotel
contract/rate detail feature for Quote Builder V2 so staff can understand a hotel
line's contract status and pricing without opening Classic.

---

## 1. Current hotel model / surface inventory

- Models (`apps/api/prisma/schema.prisma`): `Hotel`, `HotelContract`, `HotelRate`,
  `HotelRoomCategory`, plus meal plans (`HotelContractMealPlan`), supplements
  (`HotelContractSupplement`), cancellation policy, child policy, allotments
  (`HotelAllotment`), promotions (`Promotion`).
- The **quoted hotel line carries** `hotelId`, `contractId`, `roomCategoryId`,
  `occupancyType`, `mealPlan`, `seasonName`, and cost fields (`baseCost`,
  `costBaseAmount`, `costCurrency`, `salesTaxPercent`, `serviceChargePercent`,
  `tourismFeeAmount`, `tourismFeeCurrency`).
- `QuoteItem` has **direct `hotel` / `contract` (HotelContract) / `roomCategory`
  (HotelRoomCategory) relations** — a priced hotel line resolves its exact
  contract/rate context unambiguously.
- Hotels-step rows are **anchored on `pricedQuoteItemId`**.
- **Ambiguous matches have `pricedQuoteItemId` undefined** (`quote-v2-adapter.ts`),
  so they already fall out of preview/apply.

`HotelContract` notable fields: `validFrom`/`validTo`, `currency`,
`confidence` (`HotelContractConfidence` = IMPORTED_UNVERIFIED … VERIFIED),
`lastVerifiedAt`/`verifiedBy`/`verificationNotes`, `ratePolicies` (JSON).

## 2. Current V2 hotel surfaces

- **Hotels step** in Quote Builder V2 (`components/quote/v2/steps/hotels-step.tsx`).
- **ContractBadge** (contracted / on-request / no-contract).
- **meal plan / rooming summary / city tax / rate / room / night** display.
- **"Why?" diagnostics** section.
- **set-primary** display toggle (no re-price).
- **flag-gated preview / apply** (single matched priced line).
- **Ambiguous matches resolve in Classic** (no preview/apply; a "resolve in Classic"
  note).

## 3. Recommended endpoint option — C

**`GET /quotes/:quoteId/v2/items/:itemId/hotel-contract-summary`**

Why C is safest:

- **Anchors on the priced `QuoteItem`.**
- **Resolves the exact hotel / contract / roomCategory context** via the item's
  direct relations.
- **Avoids hotel / season / room ambiguity** (a hotel has many contracts/seasons/
  rooms; the item pins one).
- **Inherits ambiguous-match handling** — no `pricedQuoteItemId` ⇒ no button.
- **Reuses `findOne(quoteId, actor)` + item-scoped-to-quote** (VV-3 pattern) →
  cross-quote/missing → 404.

Rejected:

- **Option A** (`GET /hotels/:hotelId/contract-summary`) — `hotelId` alone is
  ambiguous (which contract/season/room?), decoupled from the quoted line.
- **Option B** (hotel-option-based) — as primary, because a hotel option may not
  have a resolved priced item, and the valuable rate detail only exists via the
  item.

## 4. Recommended response shape (whitelist-curated)

```
{
  itemId,
  quoteId,
  hotel:    { name, city, category, preferenceRank? },
  contract: { status, name?, validFrom?, validTo?, currency?,
              confidence?, lastVerifiedAt? },
  room:     { categoryName?, mealPlan?, occupancyType?, seasonName? },
  policies: { hasCancellationPolicy, hasChildPolicy, supplementsCount,
              mealPlanCodes },
  warnings: string[],
  cost?:    { baseCost, costBaseAmount, costCurrency,
              salesTaxPercent, serviceChargePercent,
              tourismFeeAmount?, tourismFeeCurrency? }   // finance-visible roles only
}
```

## 5. Redaction / privacy rules

- **Whitelist extraction only** — never spread raw hotel/contract/rate objects.
- **No raw JSON.**
- **No `ratePolicies` blob.**
- **No `verificationNotes`.**
- **No supplier contact details.**
- **No private supplier terms.**
- **No audit logs.**
- **No PII.**
- **Supplier cost/rate amounts only in the `cost` block.**
- **`cost` block only for `admin` / `super_admin` / `finance` via
  `canActorViewCost`.**
- **`cost` omitted entirely for non-finance roles — never zeroed / null.**

Caution to verify in implementation: confirm the rate / city-tax figures the Hotels
step already shows are client-facing / sell-side, and do not introduce new supplier
cost amounts to non-finance roles.

## 6. Frontend drawer design

- **"View contract/rate" button** in the Hotels step.
- Button **only when `pricedQuoteItemId` is set**.
- **No button for ambiguous / unmatched rows** (they keep the "resolve in Classic"
  note).
- **Read-only drawer** rendering:
  - contract status / validity / confidence
  - room / meal / occupancy / season
  - policy presence
  - warnings section
  - **cost block only if the payload includes it**
- loading / error / close states.
- **No edit / apply / send / lifecycle actions.**
- **No raw JSON.**

## 7. Affected files (future implementation)

- **Backend:**
  - `apps/api/src/quotes/quotes.controller.ts` (new route)
  - `apps/api/src/quotes/quotes.service.ts` (`getHotelContractSummary`)
  - new backend test
- **Frontend:**
  - `apps/admin-web/app/api/quotes/[id]/v2/items/[itemId]/hotel-contract-summary/route.ts`
  - `apps/admin-web/lib/quote-types.ts`
  - `apps/admin-web/app/quotes/[id]/builder-v2/builder-v2-client.tsx`
  - `apps/admin-web/components/quote/v2/quote-builder-v2.tsx`
  - `apps/admin-web/components/quote/v2/steps/hotels-step.tsx`
  - source-grep test

## 8. Test plan

- Backend role gate.
- Actor / quote scope.
- Item scoped to quote.
- Non-hotel item blocked / 404.
- Whitelist response.
- Cost present for finance-visible roles.
- Cost absent for viewer / operations.
- No raw contract/rate/hotel object.
- No `ratePolicies` / notes / contact / PII.
- No writes.
- Frontend button only with `pricedQuoteItemId`.
- Frontend fetches the safe proxy only.
- Drawer renders curated fields only.
- No edit / apply / send actions.
- Hotel apply / preview / diagnostics regressions still pass.

## 9. Risks

- **Cost/rate exposure** — strict whitelist + `canActorViewCost`; no cost amounts to
  non-finance.
- **Ambiguous hotel matches** — anchoring on `pricedQuoteItemId` avoids them (no
  button); document the limitation.
- **Stale contract vs quoted price** — the item's contract snapshot may lag the live
  contract; label "as quoted / from the priced line," not "live contract."
- **Catalog V2 vs Quote Builder V2 warning mismatch** — reuse the catalog warning
  vocabulary to keep them consistent.
- **Hotel-apply flag drift** (staging ≠ prod) — unrelated to this read-only slice but
  still open.
- **Future authoring complexity** — this read-only detail is a stepping stone; do not
  let the shape leak fields that would tempt inline editing.

## 10. GO / NO-GO

**GO**

- HC-1 backend read-only summary endpoint.
- HC-2 frontend read-only drawer after backend validation.
- HC-3 staging validation and doc reports.

**NO-GO**

- Hotel contract/rate edits.
- Catalog / supplier CRUD.
- Hotel create/apply expansion in this slice.
- Exposing supplier cost/rates to non-finance roles.
- Accept / invoice / booking.
- Staff rollout / live bookings.
- Supplier send / voucher-send.
- Full no-Classic launch.

## 11. Exact next implementation slice

**HC-1 (backend, read-only):**

- `QuotesService.getHotelContractSummary(quoteId, itemId, actor)`.
- `GET /quotes/:id/v2/items/:itemId/hotel-contract-summary`.
- Role-gated.
- `findOne(quoteId, actor)` first.
- Item scoped to quote.
- Non-hotel / cross-quote → 404.
- Whitelist extraction.
- `canActorViewCost` for the optional cost block.
- No schema.
- No flags.
- No admin-web.

Then **HC-2 (frontend):** proxy + `HotelContractSummary` type + "View contract/rate"
button (gated on `pricedQuoteItemId`) + read-only drawer + source-grep tests. Then
**HC-3:** staging read-only validation, then doc reports — matching the VV-3 cadence.

---

*Planning only. No code, no data, no flag/env, no production or staging behavior
change. Classic remains the system of record.*
