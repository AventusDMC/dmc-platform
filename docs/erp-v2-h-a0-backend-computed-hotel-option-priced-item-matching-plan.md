# ERP V2 — H-A0: Backend-Computed Hotel Option Priced-Item Matching Plan

Planning / spec doc only. No code, schema, migration, flag, env, pricing, or apply-engine change. Classic remains the system of record.

**Goal:** plan a **read-only** backend payload enhancement that computes the hotel option → priced `QuoteItem` match server-side during `loadQuoteState` / quote GET, and exposes safe, non-cost, non-PII computed fields so Quote Builder V2 (Slice H-A) can resolve `pricedQuoteItemId` deterministically without frontend guessing.

## 1. Pre-check STOP summary (why this slice exists)

Slice H-A (deterministic hotel row matching, frontend-only) hit its pre-check STOP condition. The requested design needs either a direct quote-item identity on the hotel row or the discriminators `occupancyType` / `seasonName` / `serviceDate` on the row — **none of which exist on the frontend hotel-row model**. They cannot be surfaced by a frontend change or even a read-only include, because the underlying `QuoteHotelOption` table does not store them and has no FK to `QuoteItem`. The safe unlock is to compute the match on the backend (where the priced-item fields *are* available) and return a small, safe result to the frontend.

## 2. Row-side field inventory — `QuoteHotelOption`

Schema `apps/api/prisma/schema.prisma:1433`; surfaced to admin-web as `ApiHotelOption` (`apps/admin-web/lib/quote-v2-adapter.ts:753`); GET include `quoteHotelOptionIncludeArgs()` (`apps/api/src/quotes/quotes.service.ts:8809`).

**Carries:**
- `id`
- `quoteOptionId` (→ the option-**set** `QuoteOption`)
- `hotelId`
- `roomCategoryId`
- `hotelNameSnapshot`
- `roomType`
- `mealPlan` (string) + `mealPlanCode` (`HotelMealPlan` enum)
- `nights`
- `isPrimary`
- `notes`
- relations: `hotel`, `roomCategory`

**Does NOT carry:**
- direct `quoteItemId` (no FK to `QuoteItem` at all)
- `occupancyType`
- `seasonName`
- `serviceDate` / itinerary day / service order key

## 3. Priced-line field inventory — `QuoteItem`

Schema `apps/api/prisma/schema.prisma:1154`. GET top-level `quoteItems` load: `loadQuoteState` `where: { quoteId, optionId: null }` with a bare `include` → **all scalars returned** (`apps/api/src/quotes/quotes.service.ts:12756`). Option-scoped priced items are returned separately under `quoteOptions[].quoteItems` (`quotes.service.ts:12896`).

**Carries (relevant to matching):**
- `id`
- `optionId` (→ the same option-**set** `QuoteOption`)
- `hotelId`
- `contractId`
- `roomCategoryId`
- `mealPlan` (`HotelMealPlan` enum)
- `occupancyType` (`HotelOccupancyType` enum)
- `seasonName`
- `serviceDate`
- `pricingDescription`, `nightCount`
- relations: `hotel`, `contract`, `roomCategory`

The priced side is rich; the row side is the blocker. Matching requires the same key on both sides.

## 4. Why frontend-only H-A is blocked

1. **No direct quote-item identity.** `QuoteHotelOption` has no `quoteItemId`. The only linkage is the shared option-**set** (`QuoteHotelOption.quoteOptionId` ↔ `QuoteItem.optionId`), which is **not 1:1** — a set can hold multiple hotel options and multiple items. Creating a true identity link is a schema + pricing-write change (out of scope).
2. **occupancyType / seasonName / serviceDate absent from the row model.** No frontend change and no read-only include can surface a column the `QuoteHotelOption` table does not store.
3. **Only `roomCategoryId` (already used) and `mealPlan` are on the row** — not enough to disambiguate same-hotel / same-room / same-meal collisions the slice targets.
4. **Structural gap:** option-set priced hotel items (`optionId != null`) are not even in the top-level `q.quoteItems` array the frontend matcher reads today (that array is `optionId: null` only), so the frontend cannot see the very candidates it would need for option-set rows.

Conclusion: the deterministic match must be computed where the data lives — the backend.

## 5. Recommended backend-computed matching design

During `loadQuoteState` (the GET `/quotes/:id` read path), compute a read-only match for **each `QuoteHotelOption`** and attach safe computed fields to that hotel option in the payload. **No writes, no schema, no pricing math, no resolver/`updateItem`/`recalculateQuoteTotals` change.**

### Exact safe fields to add per `hotelOptions[]` entry

- `matchedPricedQuoteItemId: string | null`
- `pricingMatchStatus: "matched" | "ambiguous" | "none"`
- `pricingMatchReason` (diagnostic code):
  - `direct_option_item_match`
  - `narrowed_by_room_meal_occupancy_season_date`
  - `ambiguous_duplicate_candidates`
  - `no_priced_item_for_option`
  - `no_contract_linked`
  - `missing_discriminator`
- `matchedDiscriminators` (optional, non-cost/non-PII summary of what resolved the match), any of:
  - `roomCategoryId`
  - `mealPlan`
  - `occupancyType`
  - `seasonName`
  - `serviceDate`

Only non-cost, non-PII identifiers/enums. No amounts, no supplier, no rate, no contract detail beyond a linked/not-linked signal already implied by the match.

## 6. Matching algorithm

For each `QuoteHotelOption` (row) resolve against candidate `QuoteItem`s:

1. **Scope** candidates to the same quote.
2. **Prefer option-set linkage:** candidates whose `QuoteItem.optionId` equals the row's `QuoteHotelOption.quoteOptionId`. If that yields a unique hotel item, that is `direct_option_item_match`.
3. **Filter to hotel items only** (`hotelId` present / hotel service).
4. **Narrow deterministically**, in order, using only keys present on *both* the row and the candidate:
   - `hotelId`
   - `roomCategoryId`
   - `mealPlan` / `mealPlanCode` compatibility
   - `occupancyType` (candidate only — used to *separate* candidates, never to invent a row value)
   - `seasonName` (candidate only — same caveat)
   - `serviceDate` / itinerary day / order (if available)
5. **Exactly one candidate →** `matchedPricedQuoteItemId = candidate.id`, `pricingMatchStatus = "matched"`, `pricingMatchReason` = `direct_option_item_match` or `narrowed_by_room_meal_occupancy_season_date`.
6. **Multiple candidates, genuinely identical on all available discriminators →** `matchedPricedQuoteItemId = null`, `pricingMatchStatus = "ambiguous"`, `pricingMatchReason = ambiguous_duplicate_candidates`. Keep Classic fallback.
7. **No candidate →** `matchedPricedQuoteItemId = null`, `pricingMatchStatus = "none"`, `pricingMatchReason` = `no_priced_item_for_option` (or `no_contract_linked` when the closest candidate has no linked contract). Keep Classic fallback.
8. **Never guess.** A required discriminator missing on the candidate set → `missing_discriminator` → treat as ambiguous/none, never a silent pick.

Note: because occupancyType/seasonName live only on the candidate, they are used to **split** otherwise-identical candidates (e.g. two priced items at the same hotel differing only in occupancy), not to filter against a row value the row does not have. When candidates differ only on a field the row cannot express, and the option-set/room/meal keys do not already isolate one, the result is `ambiguous` — safe by construction.

## 7. Classic fallback behavior (preserved)

`ambiguous` and `none` keep `matchedPricedQuoteItemId = null`, so the frontend keeps `pricedQuoteItemId` undefined and shows the existing "resolve in Classic" note — no preview/apply/View. On-request / no-linked-contract rows continue to route to Classic. Unresolvable pricing, non-editable status, non-admin/operations role, and serviceId/underlying-service swaps all remain Classic-only exactly as today. Classic stays the system of record.

## 8. Redaction / privacy rules

- No cost. No margin. No supplier rates. No raw `HotelRate`. No raw `HotelContract`. No PII. No internal notes.
- Only safe match metadata: `matchedPricedQuoteItemId`, `pricingMatchStatus`, `pricingMatchReason`, and optional non-cost/non-PII `matchedDiscriminators`.
- Existing cost redaction (`canActorViewCost` = admin/super_admin/finance) and the exact-role-gated contract-summary drawer are unchanged.

## 9. Affected files (future H-A1 implementation)

- `apps/api/src/quotes/quotes.service.ts` — in `loadQuoteState`, compute the per-hotel-option match and attach the safe fields (read-only); a small pure helper (e.g. `computeHotelOptionPricedMatch`) is preferred so it is unit-testable in isolation. No schema/resolver/write change.
- (Optional) a new pure module, e.g. `apps/api/src/quotes/hotel-option-priced-match.ts`, for the matching logic + its unit tests.
- Backend test files (new): `hotel-option-priced-match.test.ts` and/or additions to the quote GET serialization tests.
- **Frontend is NOT touched in H-A1** — it only changes later in H-A when it consumes the new field.

## 10. Frontend follow-up (later, after H-A1 lands)

- Consume `matchedPricedQuoteItemId`; set `pricedQuoteItemId` directly when `pricingMatchStatus === "matched"`.
- Preserve `ambiguous` / `none` → Classic fallback (`pricedQuoteItemId` undefined, `pricingMatchAmbiguous` true for `ambiguous`).
- Keep preview/apply buttons gated by `pricedQuoteItemId` + existing flags.
- Keep existing token / stale-preview / confirmation_required / rate_changed guards and cost redaction.

## 11. Test plan (future H-A1)

Backend tests to require:
- one `QuoteHotelOption` + one matching hotel `QuoteItem` → `matched`.
- same option-set with multiple hotel items → narrows correctly to one.
- same hotel + distinct `mealPlan` → resolves.
- distinct `roomCategoryId` → resolves.
- distinct `occupancyType` (candidate-only) → resolves when it isolates one.
- distinct `seasonName` (candidate-only) → resolves when it isolates one.
- distinct `serviceDate` / day → resolves if available.
- true duplicate candidates identical on all discriminators → `ambiguous`.
- no candidate → `none`.
- on-request / no linked contract → stays fallback (`none` / `no_contract_linked`).
- payload carries **no** cost / margin / supplier / raw rate / raw contract / PII fields.
- **no writes** performed by the GET path.
- existing quote GET serialization tests still pass.
- existing hotel preview/apply/diagnostics/contract-status/readiness/cost-redaction tests still pass.
- `tsc` / build clean or baseline unchanged.

## 12. Risks

- **Structural asymmetry:** option-set priced items live under `quoteOptions[].quoteItems`, top-level items under `q.quoteItems` (`optionId: null`). The backend helper must consider the correct candidate pool per option; getting this wrong could match the wrong pool. Mitigate with explicit option-set scoping (step 2) + unit tests.
- **Over-narrowing:** using a candidate-only field (occupancy/season) to split could wrongly separate legitimately-equal candidates; mitigate by treating "differ only on a row-absent field with no other isolator" as `ambiguous`, never a pick.
- **Payload growth / cost:** a few small string fields per hotel option — negligible; the match reuses data already loaded by `loadQuoteState`.
- **Redaction drift:** ensure the computed fields are added to the hotel-option object only, never carrying any adjacent cost/contract detail. Covered by a payload-shape test.
- **No behavioral change until H-A consumes it** — H-A1 alone must be inert to preview/apply behavior (only additive read-only fields), guarded by tests that current gating is unchanged.

## 13. GO / NO-GO

**GO**
- Read-only, additive `loadQuoteState` computation of `matchedPricedQuoteItemId` / `pricingMatchStatus` / `pricingMatchReason` (+ optional `matchedDiscriminators`) per hotel option, via a pure, unit-tested helper. No writes, no schema, no pricing math, no resolver/apply change.

**NO-GO**
- Any schema/migration (e.g. adding a real `QuoteHotelOption.quoteItemId` FK) — deferred, larger, not read-only.
- Any pricing math / resolver / `updateItem` / `recalculateQuoteTotals` change.
- Any flag/env change or production/staging action.
- Exposing cost / margin / supplier / raw rate / raw contract / PII.
- Removing the Classic fallback for ambiguous/none.
- Changing hotel apply behavior in this slice.

## 14. Exact next slice

**H-A1 — Backend read-only payload implementation.** Add a pure `computeHotelOptionPricedMatch` helper and call it in `loadQuoteState` to attach `matchedPricedQuoteItemId`, `pricingMatchStatus`, `pricingMatchReason` (and optional `matchedDiscriminators`) to each `hotelOptions[]` entry. Read-only, additive, unit-tested; no schema, no pricing math, no apply-behavior change. The frontend H-A consume-the-id change follows only after H-A1 lands.
