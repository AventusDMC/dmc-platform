# Passenger / Rooming MVP — PR-2 (Manual-entry UX Hardening) Plan

**Date:** 2026-07-04
**Status:** Plan only. No code, schema, flag, or environment change.
**References:** `docs/passenger-rooming-mvp-plan.md`,
`docs/passenger-rooming-pr1-staging-validation.md`.

**Decision:** PR-2 is **not** built all at once. It is split into three slices:
- **PR-2a** — backend delete-lead guard.
- **PR-2b** — Ops V2 passenger editing (flag-gated).
- **PR-2c** — Ops V2 rooming editing (flag-gated).

---

## Files inspected
- `apps/api/src/bookings/bookings.service.ts` — `createPassenger`, `updatePassenger`, `deletePassenger`,
  `setLeadPassenger`, `createRoomingEntry`, `autoAssignRooming`, `updateRoomingEntry`,
  `deleteRoomingEntry`, `assignPassengerToRoom`, `unassignPassengerFromRoom`.
- `apps/api/src/bookings/bookings.controller.ts` — passenger/rooming routes (`@Roles('admin','operations')`).
- Ops V2 UI: `components/ops/v2/pax-rooming-tab.tsx`, `passenger-manifest-table.tsx`, `rooming-map.tsx`;
  `app/operations/v2/ops-pax-rooming-*` (VM/tests/fixtures).
- Proxy routes: `apps/admin-web/app/api/bookings/[id]/passengers*`, `/rooming*`.
- Tests: `apps/api/src/bookings/bookings-operations-core.test.ts`.
- Classic (reference only — not to change): `app/bookings/[id]/page.tsx`, `BookingRoomingSummaryCard.tsx`.

## Current behavior found — the headline
**The Ops V2 Passengers & Rooming tab is READ-ONLY.** PR-1 shipped it with a "Changes are made in
Classic." notice, "Open in Classic" links, and render-guardrail tests that forbid
`<form>/<input>/<button>`. All manual entry currently lives in **Classic** (out of scope). So
"harden manual-entry UX in Ops V2" is really **build manual entry in Ops V2** (it does not exist yet),
consuming the already-robust backend.

**The backend is already solid and pricing-inert:**
- **Single-lead invariant enforced on every set path** — `createPassenger`, `updatePassenger`, and
  `setLeadPassenger` all atomically demote other leads in a transaction.
- **Rooming assignment is safe** — `assignPassengerToRoom` enforces room capacity, blocks
  double-assignment, and moves a passenger already in another room (a passenger is only ever in one room).
- **Delete guards** — cannot delete a passenger who still has a rooming assignment; cannot delete a
  room that still has occupants.
- `autoAssignRooming` pairs unassigned passengers into TWN/SGL rooms.
- All operations are pricing-inert, audited, and `@Roles('admin','operations')`.
- Proxy routes + backend tests already exist (Classic uses them).

## Gaps / bugs found
1. **Delete-lead gap (real, backend):** `deletePassenger` guards rooming assignments but not lead
   status — deleting the lead (once unassigned from rooming) leaves the booking with zero leads.
2. **No manual entry in Ops V2 (by design in PR-1):** users must bounce to Classic to add/edit
   passengers or rooming.
3. **No V2 mutation surface** — no passenger/rooming request helpers or edit components in V2 yet.
4. Minor: no explicit "at least one lead" backstop if the lead is lost.

## Proposed files to change
**Backend (small):**
- `apps/api/src/bookings/bookings.service.ts` — add the delete-lead guard to `deletePassenger`.
- `apps/api/src/bookings/bookings-operations-core.test.ts` — cover the guard.

**Frontend (the bulk — flag-gated editable surface):**
- `components/ops/v2/pax-rooming-tab.tsx` — swap the read-only notice for editable controls when the
  edit flag is on.
- `components/ops/v2/passenger-manifest-table.tsx` — add/edit/delete + set-lead controls.
- `components/ops/v2/rooming-map.tsx` — create/edit/delete room + assign/unassign + auto-assign.
- **New** `app/operations/v2/ops-pax-request.ts` + `ops-rooming-request.ts` — mutation helpers
  (mirroring `ops-supplier-assign-request.ts`).
- **Verify/add** proxy routes for `passengers/[passengerId]/set-lead`, `rooming/[roomingEntryId]`,
  `rooming/[roomingEntryId]/assignments[/passengerId]`.
- Update `ops-pax-rooming-render.test.ts` — the read-only guardrail becomes flag-conditional.

## Proposed UX changes
Behind a **new flag `NEXT_PUBLIC_OPS_V2_PAX_EDIT`** (default OFF, separate from PR-1's readiness flag):
- **Passengers:** inline "Add passenger" (name required + minimum fields), row edit, delete, and a
  one-click **Set lead** (current lead badged). Surface backend errors inline.
- **Rooming:** "Add room" (type + occupancy), edit, delete, assign/unassign (picker), and an
  **Auto-assign** button — surfacing capacity / already-assigned errors inline.
- Reuse the PR-1 readiness strip for live feedback.
- With the flag OFF, the tab stays exactly as PR-1 shipped (read-only + Classic links).

## Backend changes needed or not
**Yes — minimal.** Only the **delete-lead guard** in `deletePassenger` (no schema, pricing-inert).
Everything else already exists (endpoints, invariants, proxies, audit, role-gating). Recommended
guard: **block deleting the lead while other passengers exist** ("Set another passenger as lead before
deleting the lead passenger."); deleting the last remaining passenger stays allowed. No auto-promote
in the first slice.

## Tests to add/update
- **Backend:** delete-lead guard — blocked when others exist; allowed for the last passenger; existing
  rooming guard unchanged; `setLeadPassenger` still keeps exactly one lead; finance unchanged.
- **FE request helpers:** unit tests (payload shape, error passthrough).
- **FE render (flag ON):** add/edit/delete/set-lead + room create/assign/auto-assign controls render;
  backend errors surface.
- **FE render (flag OFF):** unchanged read-only behavior.
- **Pricing-inert regression:** manifest edits don't alter finance summary/totals.

## Risks / blockers
- **Scope is large** — a read-only tab becomes a full editing surface; realistically 2–3 PRs.
- **Read-only guardrail reversal** — PR-1 tests forbid form controls; PR-2 must make them
  flag-conditional so flag-OFF stays provably read-only.
- **Optimistic UI vs server truth** — re-fetch/reconcile after each mutation so the readiness strip +
  rooming validity reflect the server.
- **PII (deferred to PR-3):** edit forms expose passport/DOB inputs; keep `NEXT_PUBLIC_OPS_V2_PAX_EDIT`
  OFF in prod until PR-3 PII gating lands (endpoints are already admin/operations-only).
- **No Classic changes** — build the V2 surface via the API/proxy layer only.

## Recommended slice breakdown
- **PR-2a — Backend delete-lead guard** (small, independent, ship first): guard + tests. No schema,
  pricing-inert.
- **PR-2b — V2 passenger editing** (flag-gated): add/edit/delete/set-lead + passenger request helper +
  proxy verification + flag-conditional guardrail tests.
- **PR-2c — V2 rooming editing** (flag-gated): room create/edit/delete + assign/unassign + auto-assign
  + rooming request helper.
- Single new flag `NEXT_PUBLIC_OPS_V2_PAX_EDIT` (default OFF) gates 2b+2c; keep OFF in prod until PR-3
  (PII gating) lands.
