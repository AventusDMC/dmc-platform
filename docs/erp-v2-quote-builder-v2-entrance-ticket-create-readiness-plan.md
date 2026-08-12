# ERP V2 — Quote Builder V2 Entrance / Ticket Create Readiness Plan

Planning / read-only inspection. No code, schema, flag, env, or data changes. Classic remains the system of record. Entrance/Ticket create implementation is **not** started.

**Goal:** plan the safest next Quote Builder V2 create-item slice — **Entrance / Ticket create** — reusing the existing guarded item-create architecture with no new pricing math.

## 1. Current inventory

- **Entrance/Ticket preview/apply is live** (behind the separate entrance apply-scope flags; recognized by the persisted `entranceFeeId` scalar).
- **Entrance/Ticket create is Classic-only today.**
- **Existing V2 item-create accepts `activity` / `guide` / `meal` only** — anything else → `out_of_scope`.
- **The shared resolver already prices entrance/ticket** (the entrance branch of `resolveQuoteItemValues`, incl. Jordan Pass coverage), used by both Classic and V2 `createItem`.
- **No pricing-math change needed** — entrance create is threading `itemType: 'entrance'` through the existing V2 orchestration + a frontend panel.
- **Quote-stage entrance create has no voucher/packet side effect** — all voucher/packet code is booking-keyed; a quote-stage entrance item touches zero voucher code. Entrance→`TICKET` grouping only fires at booking stage via an explicit Ops action.
- **Flags:** `QUOTE_ITEM_CREATE` staging **ON**, production **OFF/unset**.
- **The entrance `QUOTE_PRICING_ENTRANCE_PREVIEW/APPLY` flags are apply-scope only — they do NOT gate create.**

## 2. Required fields

- `serviceId` — **required**.
- The service **must have a linked `EntranceFee`** (that relation + `!activity` triggers the entrance branch).
- `ticketRateVariantId` — optional.
- `paxCount` — optional.
- `serviceDate` — optional.
- `dayId` — required through the existing V2 route.
- `markupPercent` — optional / defaulted.
- **Never send** `entranceFeeId`, `jordanPassCovered`, or `jordanPassSavingsJod` — all computed by the resolver.

## 3. Pricing source

- `TicketRateVariant.costPrice` when a variant is selected.
- `EntranceFee.foreignerFeeJod` fallback (base fee, when no variant).
- **Jordan Pass coverage is computed by the resolver** (covered → cost 0, savings recorded; Petra-cap counted within the item's `optionId`, driven by `quote.jordanPassType`).
- Sell = cost × (1 + markup).
- No new pricing math.

## 4. Frontend design

- **`AddEntrancePanel`** (mirrors `AddActivityPanel`: service → rate variant).
- Day + service date (auto-filled from the day).
- Entrance/ticket **service select** (from `/api/services`, filtered by a new `isEntranceService` predicate).
- **Ticket rate variant select when variants exist** (populated from the selected service's `ticketRateVariants`).
- **Allow create at the base fee if the service has no variants.**
- **No cost field.**
- **No finance-gated override needed** (entrance has no user-entered cost — unlike meal).
- Reuses the two-step **Preview → Confirm** flow.
- **Selling price only.**
- Payload `itemType: "entrance"`.

## 5. Backend design

- Extend `quote-experiences-v2` to accept `itemType: entrance`.
- `resolveItemType` includes `entrance`.
- Controller body supports `ticketRateVariantId` (serviceId already present).
- `resolveContext` validates a **linked `EntranceFee`** (load the `SupplierService` including its `entranceFee` relation).
- Non-entrance service returns **`not_entrance_service`**.
- Validate `ticketRateVariantId` belongs to the service and is active (else a clear code / `not_resolvable`).
- `buildCreateInput` entrance payload (`serviceId`, `itineraryId`, `serviceDate`, optional `ticketRateVariantId`, `quantity: 1`, `markupPercent`).
- Add **`ENTRANCE_CREATE_TOKEN_KIND = 'v2-entrance-create'`**.
- Token identity binds `serviceId` + `ticketRateVariantId`.
- `createItem` / recalc / audit / `confirmation_required` / `stale_preview` / `rate_changed` guards **unchanged**.

## 6. Redaction / privacy

- Selling price only in the preview/create UI.
- Cost/margin redacted for non-finance (`canViewQuoteCostMargin`).
- No supplier rates.
- No raw services.
- No `foreignerFeeJod` internals.
- No PII.
- No internal notes.

## 7. Risks

- **Entrance markup default undecided.** Recommendation: `markupPercent = 0` (at-cost, pass-through government fee), pending team confirmation (alternative: `EXPERIENCE_DEFAULT_MARKUP`).
- **Services without `TicketRateVariant`s must still work** through the base entrance fee (variant optional; empty variant list must not block create).
- **Jordan Pass coverage can change between preview and create** (depends on `quote.jordanPassType` + sibling Petra entrances within `optionId`) and should surface as **`rate_changed`** via the existing snapshot guard.
- **The frontend filter is best-effort** (`/api/services` does not include the `entranceFee` relation, so `isEntranceService` keys on `serviceType`/`ticketRateVariants`); the backend **`not_entrance_service`** check (on the real `entranceFee` relation) is the source of truth.
- **Verify entrance SupplierServices with a linked `EntranceFee` exist on staging** before implementation.
- Source-grep FE tests are fragile; all changes flag-gated and prod-OFF.

## 8. Test plan

**Backend:**
- entrance accepted / unknown rejected.
- `serviceId` required.
- non-entrance service rejected (`not_entrance_service`).
- bad/inactive/foreign `ticketRateVariantId` rejected.
- `buildCreateInput` shape.
- `entranceFeeId` derived.
- Jordan Pass covered case → cost 0.
- token kind isolation.
- changed service/variant invalidates the token.
- `confirmation_required`.
- `rate_changed` including Jordan Pass drift.
- cost redaction.
- `feature_disabled` when the flag is OFF.
- audit `quote.item.created`.

**Frontend:**
- `AddEntrancePanel` test (panel render + `itemType: "entrance"` payload, `/api/services` + `isEntranceService` filter, optional ticket-variant select, two-step preview→confirm).
- no cost/margin shown.

**Regressions:**
- existing add-activity/guide/meal and entrance-display / cost-redaction suites stay green.

## 9. GO / NO-GO

**GO**
- Extend the V2 item-create orchestration to accept `entrance`.
- Add `AddEntrancePanel`.
- Reuse the existing item-create flags.
- Production remains OFF.

**NO-GO**
- New pricing math.
- `resolver` / `createItem` / `recalculateQuoteTotals` changes.
- Catalog / rate / entrance-fee edits.
- A new flag.
- Exposing cost/margin to non-finance.
- Supplier-send / voucher-send.
- Accept / invoice / booking.

## 10. Exact next implementation slice

**Slice M-2 — V2 Entrance/Ticket create.**
- Backend entrance arm (`quote-experiences-v2`: `resolveItemType`, `resolveContext` with the `entranceFee`-relation `not_entrance_service` guard + ticket-variant validation, `buildCreateInput`, `ENTRANCE_CREATE_TOKEN_KIND` + `typeMatches`, controller `ticketRateVariantId`); reuse `createItem` unchanged.
- Frontend `AddEntrancePanel` (entrance-service select via `isEntranceService`, optional ticket-rate-variant select, no cost field), reuse handlers/proxy/flag, add `not_entrance_service` mapping + `out_of_scope` copy, add the source-grep test.
- **Existing flags only. Production OFF.**
- **Pre-reqs:** confirm the entrance markup default; verify entrance SupplierServices with a linked `EntranceFee` exist on staging.
- Can split **M-2a (backend) / M-2b (frontend)** if a smaller first PR is preferred.
