# Hotel Section — Roadmap to a Professional Platform

_Last reviewed: 2026-05-29_

This is a sequenced, honest plan for finishing the hotel module. It is grounded in
the current code, not aspiration. The guiding principle: **finish what's half-built
before starting what's speculative**, and explicitly mark work we should *not* do
unless the business actually needs it.

## Where we are today

The **backend is well ahead of the UI.** Several "missing" features already have
models, services, and API routes — they just lack screens. That makes them cheap to
finish. A smaller set is genuinely net-new.

### Built and exposed (working end-to-end)
- Contracts: create, list, detail, **edit master data** _(done 2026-05-29)_, delete.
- Rates: per-row create / edit / delete (season, occupancy, meal plan, pricing basis,
  cost, **taxes / service charge / tourism fee** incl. net-vs-gross flags).
- Supplements: create / edit / delete, with explicit `mealPlanCode` (HB/FB/AI) tagging and
  an optional `appliesFrom`/`appliesTo` **date window** (e.g. a 31 Dec gala dinner charged
  only on nights the stay covers) — engine-gated, surfaced in the editor + Excel export.
- Cancellation policy + rules (add/delete rules), child policy + age bands (add/delete),
  meal plans (add/delete/toggle).
- Room categories CRUD; hotel master data + fact sheet editor.
- Excel **export** (full multi-sheet workbook, round-trip step 1 of 2).
- Contract health / confidence workflow; per-entity audit logging (backend).
- RateHawk hotel **content** import (catalog browse/add).

### Built in backend, NOT yet exposed in UI (fast wins)
- **Allotments / inventory** (`HotelAllotment`: counts, `releaseDays`, `stopSale`) +
  evaluation + daily-summary API. UI link is disabled.
- **Promotions** engine (`Promotion` / `PromotionRule`: %/fixed/stay-pay/free-night,
  early-bird via booking-date windows, combinability). No UI at all.
- **Audit-log viewer** — logs are written for every entity; no screen to read them.

### Not built anywhere (net-new)
- Excel **import** (round-trip step 2 of 2).
- Quote / pricing **simulator**.
- Edit (not just add/delete) for cancellation rules, child-policy bands, meal-plan details.
- Bulk rate **matrix** editor (v2 is one row at a time; matrix still on legacy UI).
- Meal-plan derivation, min-stay/min-occupancy rules on rates, rate-level sunset dates,
  per-client negotiated tiers, live CRS/GDS rate sync, room-attribute pricing.

---

## Phased plan

### Phase 1 — Finish the half-built CRUD (polish; makes it feel professional)
Small, no-migration, removes daily friction. Each is independently shippable.
1. ~~Contract master-data edit~~ ✅ done 2026-05-29.
2. ~~Edit existing **cancellation rules**~~ ✅ done 2026-05-29 (inline edit).
3. ~~Edit existing **child-policy bands**~~ ✅ done 2026-05-29 (inline edit).
4. ~~Edit **meal-plan** details (code / active / notes)~~ ✅ done 2026-05-29 (inline edit).
   `isDefault` still not settable — the meal-plans endpoint doesn't accept it; tracked
   as the separate "mark as default" backlog item.
5. ~~**Audit-log viewer** per contract~~ ✅ done 2026-05-29. Read-only timeline at
   `…/contracts/[contractId]/audit-log` merging the 5 per-entity audit tables via a new
   unified `GET /hotel-contracts/:id/audit-log` endpoint. **Phase 1 complete.**

_Size: S each. Dependency: none. Risk: low (UI + existing endpoints)._

### Phase 2 — Inventory (core DMC capability)
6. ~~**Allotments UI**: per-room date-range blocks, counts, release days, stop-sale toggle~~
   ✅ done 2026-05-29. Create / inline-edit / delete at
   `…/contracts/[contractId]/allotments`; linked from the contract detail page.
   Dates bounded to contract validity; stop-sale rows highlighted.
7. ~~**Stop-sale / availability** surfacing on quote lookups~~ ✅ done 2026-05-29. The quote
   simulator now evaluates each night and shows the worst inventory status across the stay
   (available / release-window / sold-out / stop-sale / on-request). **Phase 2 complete.**

_Size: M. Dependency: none (backend ready). Highest operational value._

### Phase 3 — Complete the Excel round-trip
8. **Excel import** — _in progress._
   - ✅ 2026-05-29: **preview (dry-run)** shipped — upload an edited export workbook, validate
     its identity (schema version + contract id) and see what would change
     (create/update/delete by hidden `_id`) with row-level validation, **writing nothing**.
     `POST /hotel-contracts/:id/import-preview` + `…/contracts/[contractId]/import` UI.
     Covers the **Supplements** sheet as the proven vertical slice.
   - ✅ 2026-05-29: **apply (upsert)** shipped for Supplements — `POST /hotel-contracts/:id/import-apply`
     re-parses + re-validates server-side, then creates/updates through the audited
     `ContractSupplementsService`, gated behind the confirmed preview. Deletes are previewed
     but NOT auto-applied (flagged for manual removal — the dangerous edge stays manual).
     Verified end-to-end against a throwaway contract.
   - ✅ 2026-05-29: preview + apply extended to the **Rates** sheet (reuses `HotelRatesService`;
     resolves room by name, validates occupancy/meal-plan/basis/dates/taxes). Verified against
     a throwaway contract.
   - _Next:_ extend to Cancellation / Child Policy / Meal Plans; decide whether to enable
     delete-by-absence behind an extra confirm.
9. **Bulk rate matrix editor** (or rely on import for bulk; decide after #8 lands).

_Size: L (#8), M (#9). Dependency: export schema (done). De-risks data entry._

### Phase 4 — Selling features
10. ~~**Promotions UI**: drive the existing engine (offer types, rules, combinability)~~
    ✅ done 2026-05-29. Promotion CRUD + a single optional applicability rule
    (room/board/travel-window/booking-window/min-stay) at
    `…/contracts/[contractId]/promotions`. Multi-rule editing on one promotion is the
    remaining slice (the rare case; preserved untouched on edit today). _Mostly done._
11. ~~**Quote / pricing simulator**: pick dates + pax + room + board, see the computed
    price breakdown~~ ✅ done 2026-05-29. Read-only GET-form page at
    `…/contracts/[contractId]/simulator`: per-night cost (rate + supplements + child
    policy + taxes) via `/hotel-rates/calculate-hotel-cost`, plus applicable promotions
    + post-discount total via `/promotions/evaluate` (new `/api/promotions/evaluate`
    proxy added). Linked from the contract header.

_Size: M each. Dependency: Phase 1–3 for the simulator to be meaningful._

### Phase 5 — Build only on real demand (do not pre-build)
- Min-stay / min-occupancy rules on rates — build when a contract first needs it.
- Rate-level sunset dates — same.
- Meal-plan derivation — the explicit `mealPlanCode` supplements may be *better*
  (auditable); leave unless operators ask.
- Per-client negotiated tiers — only if the business sells differentiated B2B tiers.
- **Live CRS/GDS rate sync** — large, ongoing-maintenance integration. Only worth it
  if live connectivity becomes a business model. Many DMCs never need it.
- Room-attribute pricing (sea view +x) — supplements cover most of this today.

---

## Sequencing rationale
- **Phase 1 before everything**: a platform where you can't edit a cancellation rule
  reads as unfinished. Cheap credibility.
- **Allotments before** any availability/booking-guarantee logic.
- **Import pairs with bulk matrix** — both are "edit many rates fast."
- **Simulator last** so it can exercise promotions + supplements + taxes together.

## Definition of "professional" for this module
Not more features — **no broken edges**: every entity you can create you can also edit
and delete; inventory is manageable; pricing is verifiable before it reaches a quote;
and the skip-tier above is a deliberate non-goal, not a guilt-backlog.
