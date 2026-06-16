# PR 12B — Additive schema for supplier base city + quote-day overnight metadata (PLAN ONLY)

**Date:** 2026-06-16
**Status:** PLAN ONLY — no code/schema/migration/DB/flag/quote/contract change.
**Goal:** the minimal additive, nullable, metadata-only schema so PR 12C can later compute driver
overnight + stationary. **No pricing in this PR.** Flag stays OFF; overnight/stationary stay blocked.

## Checkpoint record (PR 12B-1, 2026-06-16) — documentation only
1. **Three nullable fields:** `Supplier.baseCity: String?`, `QuoteItineraryDay.overnightCity: String?`,
   `QuoteItineraryDay.vehicleReturnsToBase: Boolean?`.
2. **Text-first** city fields (match existing `baseCityOverride` / day `country`; overnight rates are
   city-named ADD_ON service types, so a text city suffices; UI-simple; no FK risk).
3. **Place/City FK deferred** (coverage risk + overkill for overnight); optional `*PlaceId` only later
   if precise matching is ever needed. **No `basePlaceId`/`overnightPlaceId` now.**
4. **Base city resolution:** `TransportContract.baseCityOverride ?? Supplier.baseCity` (contract
   override wins; default on Supplier).
5. **`NULL` = unknown/unset/manual-required.**
6. **No automatic backfill** (base-city population = separate, explicitly-approved data step).
7. **No pricing behavior** — schema only; nothing reads the fields in PR 12B.
8. **Future use:** PR 12C shadow compares overnight city vs base city + `vehicleReturnsToBase`, charges
   only out-of-base nights, fails closed on missing data, avoids base-city charges + double-count.
9. **Migration strategy (12B-2):** additive nullable `ADD COLUMN` ×3, no NOT NULL/default-rewrite/
   destructive change; production-safe flow (schema-to-schema diff, `migrate status` before/after,
   `migrate deploy`, stop on drift); no backfill.
10. **Admin/API/UI capture deferred** (12B-3 supplier base city; 12D day overnight fields).
11. **Risks:** city text mismatch (normalize vocabulary in 12C); missing base city → fail closed;
    multi-base suppliers (contract override; beyond that deferred); **T.5G overnight-fold overlap**; old
    ADD_ON overlap.

Also dropped (minimality): `driverOvernightRequired` (derivable), `overnightNotes` (reuse day `notes`).
This PR (12B-1) is documentation only — no code/schema/migration/DB/flag/quote/contract change.

## Context (from PR 12A audit)
- Missing inputs: a **supplier base city** (only `TransportContract.baseCityOverride: String?` exists,
  unset) and **day-level overnight metadata** (`QuoteItineraryDay` has only `transportDayType` /
  `vehicleRetained` / `vehicleReleased` / `inRetainedBlock`).
- Overnight rates are city-named ADD_ON service types (`PETRA_OVERNIGHT`, `DEAD_SEA_OVERNIGHT`,
  `WADI_RUM_OVERNIGHT`, `AQABA_OVERNIGHT`) → an overnight **city** maps to a service-type code, not to
  a Place FK.
- Location precedents: `Place`/`City` models exist (with `Place.cityId` FK), but **text** location is
  well-precedented — `TransportContract.baseCityOverride`, `QuoteItineraryDay.country`,
  `VehicleRate.routeName` are all plain text.

## 1. Recommended minimal schema (additive, nullable)
- **`Supplier.baseCity: String?`** — the supplier's default operating base city (text).
- **`QuoteItineraryDay.overnightCity: String?`** — the group's overnight city/area for that day (text).
- **`QuoteItineraryDay.vehicleReturnsToBase: Boolean?`** — whether the vehicle/driver returned to base
  that night (NULL = unknown).

**Dropped from the candidate list (keep it minimal):**
- `basePlaceId` / `overnightPlaceId` (Place FKs) — **defer** (see §2; text-first).
- `driverOvernightRequired` — **derivable**, not stored: overnight is evaluated when
  `vehicleRetained && overnightCity != base city && vehicleReturnsToBase !== true`; NULL inputs →
  manual-required (fail closed).
- `overnightNotes` — nice-to-have; omit (planner can use existing day `notes`).

Rationale: three nullable columns across two tables, all metadata-only, mirror the existing
`baseCityOverride` (text) and day `country` (text) patterns; nothing reads them until PR 12C.

## 2. String vs Place ID
| Option | Verdict |
|---|---|
| **Text label** (recommended) | Matches existing `baseCityOverride` / day `country`; no FK risk; UI-simple; overnight rate lookup is by **city-named ADD_ON service type**, so a text city suffices. |
| **Place/City FK** | `Place`/`City` exist, but coverage may be incomplete → broken-FK risk; overkill for overnight (no Place needed to pick `*_OVERNIGHT`). |
| **Both (text + optional placeId)** | Future enhancement: add an **optional nullable** `*PlaceId` later if precise Place/area matching is ever needed; the text label stays the source of truth. |
**Recommendation:** **text-first** now; optional `placeId` columns deferred to a later PR only if rate
matching demands it. Normalize the overnight-city vocabulary in PR 12C (map text → service-type code),
not via schema.

## 3. Supplier base city
- **Default:** `Supplier.baseCity` (e.g., Alpha/Almushtari → "Amman" or "Aqaba" — populated as a
  separate, approved data step, NOT in this migration).
- **Per-contract override:** reuse existing `TransportContract.baseCityOverride` (wins over
  `Supplier.baseCity`).
- **Multiple bases per supplier:** handled by the contract override; genuinely multi-base operations
  beyond that (per-route/region base) are **out of scope** — note as a future option, do not model now.
- **Missing base city:** PR 12C **fails closed** — overnight cannot be evaluated → manual-required /
  blocked; never charge.

## 4. Quote-day overnight metadata (capture intent; no pricing)
Planners will (in PR 12D) indicate per day: `overnightCity` (group's overnight city/area);
`vehicleReturnsToBase` (vehicle/driver stayed out vs returned). "Whether overnight should be
evaluated" is **derived** (retained + out-of-base + not-returned). "Vehicle stayed with group" is
already captured by `vehicleRetained`/`inRetainedBlock`. **Unknown/manual-required** = NULL fields →
PR 12C blocks (fail closed). This PR only adds the columns; it neither reads nor prices them.

## 5. Backward compatibility
- All three fields **nullable**; existing Supplier/QuoteItineraryDay rows unchanged.
- **NULL = unknown/unset.** Overnight pricing stays blocked/manual-required until the metadata is
  explicitly present (enforced in PR 12C, not here).
- **No automatic backfill** (base-city population is a separate, explicitly-approved data step).
- No behavior change from the migration alone (no code reads the fields in 12B).

## 6. Migration strategy (plan only — do NOT create the migration)
- **Additive nullable columns only**: `ALTER TABLE "suppliers" ADD COLUMN "baseCity" TEXT;`
  `ALTER TABLE "quote_itinerary_days" ADD COLUMN "overnightCity" TEXT, ADD COLUMN
  "vehicleReturnsToBase" BOOLEAN;` (exact mapped names per `@map`). No NOT NULL, no defaults that
  rewrite rows, no destructive change.
- **Production-safe flow** (as used for prior transport migrations): generate via schema-to-schema
  diff from the `origin/main` baseline (avoid local-drift pollution); `prisma migrate status` BEFORE
  (confirm "up to date", only the new migration pending) and AFTER; apply via `prisma migrate deploy`
  (never `migrate dev` against shared Railway). **Stop and report** on any drift / unexpected pending
  migration / destructive diff.
- No data backfill in the migration.

## 7. Admin / API impact (later PRs — plan only)
- **Supplier admin:** add a `baseCity` text field (12B-3).
- **Quote itinerary day form:** add `overnightCity` + `vehicleReturnsToBase` to the PR7 "Transport
  day (advanced)" section (12D).
- **API DTOs:** `UpdateQuoteItineraryDayDto` (+`overnightCity`, `vehicleReturnsToBase`); supplier
  update DTO (+`baseCity`). Validation: optional strings/bool; trim; no enum (text). Display labels:
  "Base city", "Overnight city/area", "Vehicle returned to base?".
- All additive/optional; omitted → unchanged (metadata-only, like the PR6/PR7 retention fields).

## 8. Shadow calculation dependency (PR 12C will use these)
- Resolve base city = `TransportContract.baseCityOverride ?? Supplier.baseCity`.
- For each retained overnight: if `overnightCity` is NULL or base city is NULL → **block**
  (manual-required). If `overnightCity == base city` or `vehicleReturnsToBase === true` → **no charge**.
  Else (out-of-base, not returned) → evaluate contract policy (INCLUDED/WAIVED → none; SEPARATE →
  city `*_OVERNIGHT` rate or flat `driverOvernightAmount`, else block).
- Avoid charging base-city nights; avoid double-counting with stationary and with the T.5G fold (apply
  one mechanism only). All read-only in 12C (shadow).

## 9. Tests (for the future 12B-2 implementation)
- Existing suppliers with NULL `baseCity` still load/serialize.
- Existing quote days with NULL `overnightCity`/`vehicleReturnsToBase` still load/serialize.
- Updating `Supplier.baseCity` / day overnight fields persists (when the admin/API lands).
- **NULL metadata does not change pricing**; no quote totals change; no overnight/stationary pricing
  activated by the schema alone.
- Migration is **additive only** (diff = ADD COLUMN ×3, all nullable; no drop/alter-type/NOT NULL).
- `prisma migrate status` clean before/after.

## 10. Risks
- **City text mismatch** → later rate-lookup misses: mitigate with a normalized overnight-city
  vocabulary (text → `*_OVERNIGHT` code) in PR 12C; consider constraining the planner field to known
  overnight cities.
- **Missing Place records** → avoided by text-first (no FK).
- **Multiple base cities per supplier** → contract override; multi-base beyond that deferred.
- **Base city missing → false charges** → fail closed (block, never charge) in PR 12C.
- **`vehicleReturnsToBase` ambiguity** → NULL = unknown = manual-required.
- **Old ADD_ON / T.5G overnight-fold overlap** → reconcile in PR 12C/12F (apply one mechanism).
- **Accidental live-pricing activation** → none possible from 12B (schema only; no pricing reads the
  fields; flag OFF).

## 11. Recommended PR split
- **PR 12B-1 — schema plan/docs** (this). No code.
- **PR 12B-2 — additive schema migration** (`Supplier.baseCity`, `QuoteItineraryDay.overnightCity` +
  `vehicleReturnsToBase`), nullable/metadata-only; production-safe flow; no backfill.
- **PR 12B-3 — admin/API metadata capture** (supplier base city; day overnight fields in DTO/form).
- **PR 12C — shadow overnight/stationary calculation** (read-only, flag-gated).
- **PR 12D — planner UI.** **PR 12E — controlled validation.** **PR 12F — live apply behind
  flag/allowlist** (+ reconcile/retire T.5G fold, coordinate with PR 13).
**Recommendation:** 12B-1 now (this), then 12B-2 (migration) on approval; base-city population is a
separate approved data step.

## Acceptance criteria (for the PR 12B chain)
- Three additive nullable columns only (`Supplier.baseCity`, `QuoteItineraryDay.overnightCity`,
  `QuoteItineraryDay.vehicleReturnsToBase`); no NOT NULL/default-rewrite/destructive change.
- Existing rows unchanged; NULL = unknown; no pricing/total change; overnight/stationary still
  blocked/manual-required; flag OFF.
- `prisma migrate status` clean before/after; migration applied via `migrate deploy`; no backfill.
- No reads of the new fields until PR 12C (shadow); `quotes.service.ts` untouched in 12B-2.

## Strictly not in this step
No code/schema/migration/DB/flag/quote/contract change; no PR 12C–F; no PR 13; no production
activation; no quote-WIP stash; no dana; `proposal-v3-pdf-export.test.ts` excluded.
