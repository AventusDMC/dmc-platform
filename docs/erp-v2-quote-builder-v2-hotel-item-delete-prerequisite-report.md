# ERP V2 — HD-a: Hotel Item Delete — Prerequisite Report & Decision (NO-GO)

**Status: closeout (documentation-only).** Records the HD-a read-only prerequisite investigation and the approved product decision. No code, schema, migration, flags, env, staging, or production changes. This document authorizes **no** implementation, schema work, or gate change.

## 1. Executive decision

> **NO-GO — Hotel item deletion must not proceed to backend or frontend implementation.**

The individually-safe axes — **deterministic stored line totals**, **supplier-master isolation**, **DRAFT-stage allotment behavior**, and a **possible positive `hotelId` classification** — do **not** overcome the structural (two-entity, heuristic-linked) model, the primary-selection gap, the completeness/readiness inconsistency, and the rooming-data cascade. Hotel deletion stays **Classic-only**.

## 2. Current capability boundary

- Guarded item **create + delete** is complete **only** for: `activity`, `guide`, `meal`, `entrance`, `external_package`.
- **Hotel, transport, and unclassified** rows remain **non-removable** (`item_not_removable`).
- Classic remains the system of record.
- ERP V2 remains build/test only.
- Production item-mutation remains **OFF**.
- Supplier sending remains disabled.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.

## 3. Core structural finding — there is no single persisted "hotel row"

A hotel in V2 is a **two-part construct with only a runtime heuristic link**:

- The Hotels-step **displayed row is primarily a `QuoteHotelOption`** (built from `quoteOptions.hotelOptions`, grouped by city — `apps/admin-web/lib/quote-v2-adapter.ts:1027–1102`).
- **`QuoteHotelOption` carries `isPrimary`** (`apps/api/prisma/schema.prisma:1444`).
- The **priced hotel line is a separate `QuoteItem`**, carrying hotel pricing + contract identifiers (`hotelId`, `contractId`, `roomCategoryId`, `occupancyType`, `mealPlan`, `totalCost`, `totalSell` — `schema.prisma:~1205–1210`).
- There is **no stored foreign-key relationship** between the displayed `QuoteHotelOption` and the priced `QuoteItem`.
- Their association is established through a **runtime matcher** that may return **matched / ambiguous / none** (`apps/api/src/quotes/hotel-option-priced-match.ts:15`; reasons `no_priced_item_for_option` / `ambiguous_duplicate_candidates` / `missing_discriminator` / `no_contract_linked`, `:20–23`; attached in `loadQuoteState` via `computeHotelOptionPricedMatch`, `apps/api/src/quotes/quotes.service.ts:12987`).
- Quotes with **no `QuoteHotelOption` rows** display **synthetic, read-only fallback rows** derived from itinerary/day-item hotel assignments (`quote-v2-adapter.ts:1106–1159`, `editable:false`, no `optionId`).

## 4. Why existing delete operations are insufficient

- Deleting **only the `QuoteHotelOption`** (Classic `removeHotelOptionAlternative`, `quotes.service.ts:9046–9059`) removes the visible choice but **leaves the priced `QuoteItem` and its cost behind** — and does not recalculate totals.
- Deleting **only the priced `QuoteItem`** (`removeItem`, `quotes.service.ts:6570–6589`) recalculates totals but **leaves the displayed hotel option behind** (now unpriced).
- Deleting the priced item **does not update `isPrimary`** (which lives on the option).
- **Neither operation alone means "remove the hotel from the quote."**
- An **atomic two-entity delete cannot be guaranteed**, because the option↔item link is a **heuristic that may be ambiguous or absent** (`matched`/`ambiguous`/`none`, §3).

## 5. Primary-selection blocker

- `isPrimary` exists on **`QuoteHotelOption`**, not `QuoteItem` (`schema.prisma:1444`).
- Existing set-primary behavior **demotes siblings and promotes the selected option** per (option-set, city) (`quotes.service.ts:9033–9038`).
- Existing option deletion has **no deterministic primary reselection** (`removeHotelOptionAlternative` is unconditional, `:9046–9059`).
- Removing a **primary** hotel can leave a stop with **no selected hotel**.
- **No automatic reselection rule is approved.**
- **Primary-hotel deletion therefore remains blocked.**

## 6. Completeness and readiness blocker

- Hotel completeness and proposal readiness are **derived at read time** (`apps/admin-web/lib/quote-v2-readiness.ts:56,83–93`; `quote-helpers.ts:75–99`) — no persisted/cached column.
- They depend on **selected/primary** hotel options (`selected = QuoteHotelOption.isPrimary`, adapter `:1084`).
- Removing a **primary** option can move the stop into **"review"** (`quote-v2-readiness.ts:93`).
- Removing the **only** option can cause the city to **disappear from the derived hotel list** instead of appearing as incomplete (the city map entry is only created when an option exists — `quote-v2-adapter.ts:1028–1033`).
- This can produce **misleading readiness state**.
- **Deleting the only hotel remains blocked.**

## 7. Rooming-data risk (critical)

- `RoomingGroup.hotelQuoteItemId` references the hotel `QuoteItem` (`schema.prisma:1521`), and the relation is **`onDelete: Cascade`** (`:1533`).
- `RoomingAssignment.roomingGroup` is also **`onDelete: Cascade`** (`:1546`).
- Deleting a hotel `QuoteItem` would therefore **silently delete its rooming groups and passenger rooming assignments**.
- The current remove-preview **does not surface this side effect**.
- **This alone prevents reuse of the existing generic delete flow for hotel rows.**

## 8. Contract and allotment findings (safe — not an implementation approval)

- Removing a DRAFT-quote hotel `QuoteItem` would **not delete or mutate hotel contracts, rates, room categories, or supplier master data** — those relations are child-side with no `onDelete` (`schema.prisma:1253/1255/1261`); `removeItem` writes only `quoteItem.delete` + `recalculateQuoteTotals` (`quotes.service.ts:6570–6589`).
- Allotment consumption is **derived from confirmed-booking snapshots** (`apps/api/src/hotel-contracts/hotel-allotment-consumption.ts:116`), with no stored counter, enforced only at booking confirmation (`bookings.service.ts:2111/2167/2193`; PR #192).
- A **DRAFT quote does not create a stored allotment hold** that must be released.
- **Cross-quote supplier-master isolation is preserved** (master data referenced by id only).

*These green findings do not authorize implementation; the §3–§7 blockers govern.*

## 9. Total-projection findings (safe — not an implementation approval)

- Hotel totals are **persisted on the priced `QuoteItem`** (`totalCost`/`totalSell`).
- **Current minus stored line totals is deterministic**; `recalculateQuoteTotals` **sums persisted line totals** and does **not re-resolve hotel rates** (`quotes.service.ts:9906–9922,10735`).
- Per-room/per-person, occupancy, nights, meals, tax, markup, and overrides are **already reflected in the stored totals** at create/apply time.
- **This technical safety does not resolve the two-entity, primary, completeness, or rooming blockers.**

## 10. Eligibility and fail-closed decision

- A future hotel classifier **could potentially** use the positive `hotelId` foreign key (present on every applied hotel line — `quotes.service.ts:7257`); **taxonomy-text matching is insufficient** (`service-taxonomy.ts:60–100`).
- **No eligibility change is authorized.**
- **Hotel remains explicitly excluded.**
- **Transport remains explicitly excluded.**
- **Legacy/unclassified rows remain fail-closed** (`quote-experiences-v2.service.ts:904–949`, denylist + allowlist; unclassified → `item_not_removable`).
- Existing classifier, routes, tokens, permissions, and frontend affordances remain **unchanged**.

## 11. Product decisions and disposition (authoritative)

| Question | Decision |
|---|---|
| Delete `QuoteHotelOption`, `QuoteItem`, or both? | **No V2 hotel delete under the current model** |
| Automatically reselect primary? | **No rule introduced; primary deletion blocked** |
| Allow deleting the only hotel? | **No** |
| Ambiguous / no match? | **Remain fail-closed and Classic-only** |
| Zero-option / synthetic rows? | **Remain read-only in V2 and Classic-only for removal** |
| Add deterministic schema link? | **Not approved** |
| Add schema / migration? | **Not approved** |
| Proceed to backend / frontend work? | **No** |
| Reopen later? | **Only through a new explicitly approved readiness track** |

## 12. Reopening criteria

The track may be reconsidered **only if** a future, explicitly approved plan addresses **all** of:

- A **deterministic persisted relationship** between the displayed and priced hotel entities.
- **Defined atomic deletion semantics** (option + item, or a coherent single operation).
- An **approved primary-reselection or incomplete-stop rule**.
- **Correct only-hotel completeness behavior** (incomplete, not vanished).
- **Explicit handling of rooming groups and passenger assignments**.
- **Safe preview of every destructive side effect** (including rooming cascade).
- **Legacy / zero-option** behavior.
- **Eligibility, permission, redaction, audit, testing, and staging-validation** plans.
- **Separately approved schema/migration work** if required.

## 13. Scope and non-actions

Explicitly confirmed for this PR:

- No backend or frontend implementation.
- No route or token changes.
- No classifier changes.
- No schema or migration.
- No flag or environment changes.
- No pricing changes.
- No staging or production access.
- No quote/item mutation.
- No Accept, invoice, booking, conversion, public link, voucher, packet, supplier-send, or email/send.
- No Classic changes.
- No transport or item-edit work.
