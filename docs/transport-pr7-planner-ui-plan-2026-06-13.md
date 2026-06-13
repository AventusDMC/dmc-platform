# PR 7 — Planner UI for Per-Day Transport Metadata (PLAN ONLY)

**Date:** 2026-06-13
**Status:** PLAN ONLY — no code. For approval.
**Goal:** Let a planner set the PR 6 nullable metadata (`transportDayType`,
`vehicleRetained`, `vehicleReleased`, `inRetainedBlock`) per itinerary day. **Non-live-affecting**:
no pricing/total change, no package activation, no min-day enforcement, no overnight/
stationary charging, no pilot contracts, no `DAILY_PACKAGE`.

## 1. UI location
The **itinerary day editor** — `apps/admin-web/app/quotes/[id]/QuoteItineraryDayForm.tsx`.
It already edits day-level metadata (title, notes, country) and saves via
`PATCH /api/itinerary/day/:dayId`, so retention (also day-level) belongs here.
Add a collapsible **"Transport day (advanced)"** subsection below notes.

*Deliberately NOT the QuoteServicePlanner / QuoteItemCard* — those are in the preserved
quote-WIP stash (`stash@{0}`), so editing them risks a conflict. The day form is **not** in
that stash → no overlap. (See Risks.)

## 2. Fields to expose — two simple selects (contradiction impossible by construction)
**Transport Day Type** (writes `transportDayType`; default **Auto / Unset → NULL**):
Auto/Unset · Airport transfer (`AIRPORT_TRANSFER`) · Point-to-point (`POINT_TO_POINT`) ·
Touring route (`TOURING_ROUTE`) · Full-day service / disposal (`FULL_DAY_SERVICE`) ·
Half-day service (`HALF_DAY_SERVICE`) · Stationary full day (`STATIONARY_FULL_DAY`) ·
Stationary half day (`STATIONARY_HALF_DAY`) · Standby / waiting (`STANDBY_WAITING`) ·
Free day / no vehicle (`FREE_DAY_NO_VEHICLE`).

**Vehicle retention** — a **single select** (default **Auto / Unset**) that writes exactly
one boolean and clears the others, so retained+released can never both be true from the UI:
| Option | Writes |
|---|---|
| Auto / Unset | all three NULL |
| Vehicle retained | `vehicleRetained=true`, others NULL |
| Vehicle released | `vehicleReleased=true`, others NULL |
| Part of retained block | `inRetainedBlock=true`, others NULL |
| *Manual review required / conflict* | **read-only display state** when loaded data has `vehicleRetained && vehicleReleased` — not selectable; planner must pick a real value to resolve |

Using one select (not two booleans) is what makes contradiction hard to create.

## 3. Safety defaults
- Existing days (all fields NULL) load as **Auto / Unset** on both selects.
- NULL stays NULL unless the planner explicitly chooses; **no auto-fill, no backfill, no
  inferred values written**. (Inference stays runtime-only in the shadow path.)
- Saving sends only what changed; omitted fields are untouched.
- Contradiction can't be created via the UI (single select); the API also rejects it
  (defense in depth). Pre-existing contradictory data shows the read-only "conflict" state.

## 4. API / DTO requirements
- **Endpoint (existing):** `PATCH /itinerary/day/:dayId` → `QuoteItineraryService.updateDay`
  → proxy `apps/admin-web/app/api/itinerary/day/[dayId]/route.ts` (already exists).
- **DTO:** add 4 **optional** fields to `UpdateQuoteItineraryDayDto`
  (`quote-itinerary.dto.ts`) and to the controller `UpdateDayBody` + `toUpdateDayDto`
  mapping — exactly mirroring the existing `country` field. Service `updateDay` `data:` block
  adds the 4 fields (like `country: normalized.country`).
- **Backward compatibility:** all optional; clients that don't send them are unaffected;
  existing rows stay NULL.
- **Validation rules (service-side):**
  - `transportDayType`: must be a value in the `OperationalTransportType` const, or null.
    Reject unknown strings (400).
  - `vehicleRetained` / `vehicleReleased` / `inRetainedBlock`: boolean or null.
  - **Reject `vehicleRetained === true && vehicleReleased === true`** (400, clear message)
    — defense in depth even though the UI prevents it.
- **Proxy:** confirm `…/day/[dayId]/route.ts` forwards the new body fields (it likely
  passes the body through; if it whitelists keys, add them).

## 5. Shadow diagnostics in the UI?
**No (default).** PR 7 is capture/editing only. Eligibility output stays in the separate
debug endpoint (`GET …/package-eligibility-shadow`). If we ever want an inline preview,
gate it behind a debug flag in a later PR — not PR 7.

## 6. Test plan
**API (`quote-itinerary.service.test.ts` or sibling):**
- NULL metadata day loads/serializes with the fields null.
- save `transportDayType` only → persisted; others untouched.
- save `vehicleRetained` / `vehicleReleased` / `inRetainedBlock` (each) → persisted.
- **contradiction `vehicleRetained && vehicleReleased` → 400** (rejected).
- invalid `transportDayType` → 400.
- omitting fields leaves existing values unchanged.
- saving metadata does **not** change quote totals or pricing (no recompute of costs).

**admin-web:** day form renders the two selects defaulting to Auto/Unset for NULL; the
retention single-select can't emit a contradiction; payload includes the fields. (Mind the
`page.test.tsx` source-grep tests — keep new strings out of asserted snapshots.)

## 7. File list (expected)
| File | Change |
|---|---|
| `apps/api/src/quote-itinerary/quote-itinerary.dto.ts` | +4 optional fields on `UpdateQuoteItineraryDayDto` |
| `apps/api/src/quote-itinerary/quote-itinerary.controller.ts` | `UpdateDayBody` fields + `toUpdateDayDto` mapping |
| `apps/api/src/quote-itinerary/quote-itinerary.service.ts` | `updateDay` data block + validation (const check + contradiction reject) |
| `apps/api/src/quote-itinerary/quote-itinerary.service.test.ts` | API save/validation tests |
| `apps/admin-web/app/quotes/[id]/QuoteItineraryDayForm.tsx` | the two selects + payload |
| `apps/admin-web/app/api/itinerary/day/[dayId]/route.ts` | verify/forward new fields (only if it whitelists) |
| `docs/transport-pr7-planner-ui-plan-2026-06-13.md` + verification doc | docs |

*(Reuse the `OperationalTransportType` const from `apps/api/src/common/transport-day-classification.ts`
for allowed values; the admin-web select options can mirror it as a small local list.)*

## 8. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Accidental quote recalculation on save | Treat like `country`/`notes` (metadata) — verify `updateDay` doesn't trigger cost recompute; metadata fields never feed pricing |
| Accidentally saving inferred values | UI defaults Auto/Unset → writes NULL; never pre-fill from inference; only persist explicit choices |
| Confusing controls for normal users | Collapsible "advanced" subsection, clear labels, Auto default |
| Changing live pricing by mistake | Metadata-only; no pricing/quote-cost code touched; `quotes.service.ts` untouched |
| Conflict with preserved quote-WIP stash | Edit `QuoteItineraryDayForm.tsx` (not in the stash); avoid QuoteServicePlanner/QuoteItemCard which ARE in `stash@{0}` |
| `page.test.tsx` source-grep breakage | Check baselines; keep added markup out of asserted source snapshots |
| Proxy drops new fields | Verify the day proxy forwards the body; extend if it whitelists |

## 9. Acceptance criteria
- Planner can set/clear `transportDayType` + retention per day via the day editor; saves via
  the existing `PATCH /itinerary/day/:dayId`.
- Existing days show Auto/Unset; NULL preserved unless explicitly changed; no backfill.
- Contradiction impossible via UI; API rejects it (400).
- **No quote total / pricing method / supplier change; no package activation; no
  `DAILY_PACKAGE`; no min-day enforcement; no overnight/stationary charging; no pilot contract.**
- Shadow endpoint now reflects planner-set metadata (already wired in PR 6).
- Tests pass; `nest build` + admin-web build pass; PR limited to the listed files; no quote
  WIP / dana / `touring_route_days` changes.

## Open decisions for you
1. Confirm **UI location = `QuoteItineraryDayForm`** (recommended; avoids the WIP-stash files).
2. Confirm the **single-select retention** design (vs two separate toggles) — recommended to
   make contradiction impossible.
3. Confirm **no inline eligibility preview** in PR 7 (keep it in the debug endpoint).
