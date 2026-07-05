# Passenger / Rooming MVP — PR-2c (V2 Rooming Editing) Plan

**Date:** 2026-07-05
**Status:** Plan only. No code, schema, flag, or environment change.
**Decision:** PR-2c is split into two slices (Option B):
- **PR-2c-1** — Room CRUD (create / edit / delete room).
- **PR-2c-2** — Assignments + auto-assign (assign / unassign passengers, auto-assign).

Both slices sit behind the **same** flag as PR-2b — `NEXT_PUBLIC_OPS_V2_PAX_EDIT` (default OFF,
admin/operations) — and add **no backend changes**.
**References:** `docs/passenger-rooming-pr2-manual-entry-plan.md`,
`docs/passenger-rooming-pr2b-staging-validation.md`.

---

## Files inspected
- Backend: `apps/api/src/bookings/bookings.service.ts` — `createRoomingEntry`, `updateRoomingEntry`,
  `deleteRoomingEntry`, `assignPassengerToRoom`, `unassignPassengerFromRoom`, `autoAssignRooming`;
  `bookings.controller.ts` rooming routes (`@Roles('admin','operations')`); `BookingRoomOccupancy` enum.
- Proxies: `apps/admin-web/app/api/bookings/[id]/rooming/*` (5 files: create, auto-assign,
  update/delete-via-intent, assign, unassign).
- UI/VM: `components/ops/v2/rooming-map.tsx`; `app/operations/v2/ops-pax-rooming-vm.ts` (`RoomRowVM`).
- Tests: `bookings-operations-core.test.ts`, `ops-pax-rooming-vm.test.ts`, `ops-pax-rooming-render.test.ts`.

## Existing behavior found
Backend is complete, robust, pricing-inert — and (unlike PR-2b) has **no PII / required-field trap:**
- `createRoomingEntry` — roomType optional; occupancy enum (`single|double|triple|quad|unknown`,
  default `unknown`); notes/sortOrder optional.
- `updateRoomingEntry` — updates roomType/occupancy/notes/sortOrder; guard: "Room occupancy cannot be
  reduced below the number of assigned passengers." No recalc → pricing-inert.
- `deleteRoomingEntry` — blocks deleting a room that still has occupants.
- `assignPassengerToRoom` — enforces capacity, blocks double-assignment, moves a passenger already in
  another room (single-room invariant).
- `unassignPassengerFromRoom` — removes an assignment.
- `autoAssignRooming` — pairs unassigned passengers into TWN/SGL rooms.
- All `@Roles('admin','operations')`, audited, pricing-inert.
- Rooming map UI is read-only; render guardrails forbid `<form>/<input>/<select>`.

## Proxy / helper gaps
1. **All 5 rooming proxies are Classic form-post + 303-redirect** — not consumable by a V2 client tab.
   → add **new V2 JSON proxies under `/api/bookings/:id/v2/rooming`** (additive; Classic untouched).
2. **No rooming request helpers** in V2 → add pure builders (mirror `ops-passenger-request.ts`).
3. **`RoomRowVM` exposes `assignedNames` (strings only), not passenger IDs** — assign/unassign need
   IDs → extend `RoomRowVM` with `assignedPassengers: {id, name}[]` (needed in PR-2c-2).
4. Read-only rooming-map guardrail must become **flag-conditional** (as PR-2b did for passengers).

## Proposed files to change
**New (FE):** `ops-rooming-request.ts`; `rooming-editor.tsx`; V2 JSON proxies under `/v2/rooming/*`;
`ops-rooming-request.test.ts`.
**Modified (FE):** `ops-pax-rooming-vm.ts` (add `assignedPassengers`); `pax-rooming-tab.tsx` (render
`RoomingEditor` when the edit flag is ON, else read-only `RoomingMap`); `ops-pax-rooming-render.test.ts`.

## Proposed UI changes
Behind `NEXT_PUBLIC_OPS_V2_PAX_EDIT` (reuse the `canEditPassengers` gate the page already computes):
Add room (roomType + occupancy select), per-room Edit/Delete, Assign/Unassign passengers, Auto-assign.
Backend errors surface inline. Flag OFF → today's read-only `RoomingMap`.

## Proposed mutation flow
Identical to PR-2b: pure request builders → V2 JSON proxies (`forwardProxyJsonResponse`,
`redirect:'manual'`, `buildActorHeaders`) → client `fetch` → on success `router.refresh()` → on error
inline; no optimistic local mutation.

## Backend changes needed or not
**None.** Rooming endpoints, capacity/occupancy/delete guards, single-room-move, auto-assign, audit,
and role-gating already exist and are pricing-inert. No rooming equivalent of the PR-2b passport
blocker. PR-2c is **frontend-only.**

## Tests to add/update
Request-helper tests (URL/method/body + occupancy whitelist); proxy source-grep (JSON not
redirect/formData; Classic untouched); render tests (flag ON controls incl. occupancy select; flag OFF
read-only map unchanged); VM test for `assignedPassengers`; pricing-inert (no finance fields);
Classic room-validity pins stay green.

## Risks / blockers
- Read-only guardrail reversal for the rooming map (flag-conditional).
- VM needs assigned passenger IDs (additive; don't disturb pinned validity semantics).
- Inline error surfacing for the four rooming guards (capacity, occupancy-reduce,
  delete-with-occupants, already-assigned).
- Flag `NEXT_PUBLIC_OPS_V2_PAX_EDIT` now also gates rooming — intended; note it in the tab.
- Use `router.refresh()` so validity/readiness reflect server truth.
- Not a blocker: no backend change; pricing-inert; guards already enforced.

## Slice breakdown (approved: Option B — two slices)
- **PR-2c-1 — Room CRUD:** create/edit/delete room (2 proxies: `/v2/rooming/route.ts` create,
  `/v2/rooming/[roomingEntryId]/route.ts` PATCH+DELETE), `ops-rooming-request.ts` (CRUD builders +
  whitelist), `rooming-editor.tsx` (CRUD only), tab wiring, flag-conditional guardrail + tests.
  Assignments/auto-assign are OUT of scope here.
- **PR-2c-2 — Assignments + auto-assign:** assign/unassign (`/v2/rooming/[id]/assignments` +
  `.../[passengerId]`) + auto-assign (`/v2/rooming/auto-assign`), assignment request helpers,
  assignment picker UI, `RoomRowVM.assignedPassengers`.

No backend changes in either slice; both flag-gated OFF by default.
