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
- Supplements: create / edit / delete, with explicit `mealPlanCode` (HB/FB/AI) tagging.
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
5. **Audit-log viewer** per contract (read-only; backend already records it). _Open._

_Size: S each. Dependency: none. Risk: low (UI + existing endpoints)._

### Phase 2 — Inventory (core DMC capability)
6. **Allotments UI**: per-room date-range blocks, counts, release days, stop-sale toggle.
   Backend + API exist; this is wiring + a calendar/table view.
7. **Stop-sale / availability** surfacing in the allotment view and on quote lookups.

_Size: M. Dependency: none (backend ready). Highest operational value._

### Phase 3 — Complete the Excel round-trip
8. **Excel import**: upload → validate against schema version → preview diff → apply
   (create/update/delete by hidden `_id`), with audit logging. Pairs naturally with
   the bulk matrix need.
9. **Bulk rate matrix editor** (or rely on import for bulk; decide after #8 lands).

_Size: L (#8), M (#9). Dependency: export schema (done). De-risks data entry._

### Phase 4 — Selling features
10. **Promotions UI**: drive the existing engine (offer types, rules, combinability).
11. **Quote / pricing simulator**: pick dates + pax + room + board, see the computed
    price breakdown. Most valuable *after* promotions + supplements exist, so it
    validates the whole stack.

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
