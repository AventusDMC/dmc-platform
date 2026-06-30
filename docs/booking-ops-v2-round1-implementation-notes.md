# Booking Operations V2 — Round 1 Implementation Notes (corrections folded in)

**Date:** 2026-06-29
**Status:** First implementation slice landed (scaffold + derivation module + tests). Read-only only.
**Source of truth:** the read-only handoff + pre-build checklist + pre-flight inspection (this session). This doc records the **approved corrections** to the original checklist so later slices build against the corrected plan.

## Locked decisions
- Routes: **`/operations/v2`** (fleet Command Center) and **`/operations/v2/[bookingId]`** (booking workspace). `/bookings/[id]/operations-v2` is **superseded** (not built).
- Flag: **`NEXT_PUBLIC_OPS_V2_DEFAULT`** (build-time, default **OFF**). Mirrors the Quote Builder V2 flag pattern. Routes `notFound()` when off; Classic stays the only operations surface.
- Phase derivation: **copy-with-pinning-test** for Round 1. A V2-local module (`app/operations/v2/ops-phase.ts`) is a **verbatim port** of the Classic Operational Service Grid logic. **Classic `app/bookings/**` is not touched.** A true shared module is a later, no-behavior-change refactor.

## Corrections to the original checklist (approved)
1. **Guardrail reworded.** Old: "bind phase/readiness to the operations-grid response." New (correct): **"reuse the Classic phase/readiness/severity/action-center derivation; the operations-grid API returns raw rows, not phases."** Rationale: `GET /bookings/:id/operations-grid` returns raw service rows only — phase/readiness/severity/reason-list/action-center are computed client-side in Classic ([operations/page.tsx:201-250, 548-569](../apps/admin-web/app/bookings/[id]/operations/page.tsx)).
2. **Per-booking enrichment fan-out dropped for Screen 1.** The bookings list already carries per-booking `operations`/`rooming`/`finance` badges, and `/operations/dashboard` carries server KPIs + `readinessHeatmap`. The Command Center builds from **`/operations/dashboard` + `/operations/dispatch` + `/bookings` list** — no per-booking grid fan-out, no `/operations/v2/fleet-summary` endpoint.
3. **"Showing N of M"** is kept **only where the displayed queue is actually capped** (a display cap), not as an enrichment artifact.
4. **Phase-derivation port is a prerequisite** before the Screen 2 board (done in this slice).
5. **ActivityTimeline = `auditLogs` only** in Round 1. `GET /bookings/:id` does **not** include `dispatchEvents`. Dispatch events stay out unless `GET /dispatch-events` is confirmed to support a `?bookingId` filter **with no new backend work**.
6. **DocumentsList reads `services[].vouchers`** (nested) — there is no top-level `vouchers` array on the booking detail.
7. **`tailwind.config.ts` must include** `./app/operations/v2/**` and `./components/ops/v2/**` (done this slice).

## Confirmed data sources (existing GET proxies — all present)
`/api/bookings`, `/api/bookings/[id]`, `/api/bookings/[id]/operations-grid`, `/api/operations/dashboard`, `/api/operations/dispatch`, `/api/dispatch-events`, `/api/bookings/[id]/supplier-confirmation/preview`.
**Missing (Screen 3 only, deferred):** `/api/bookings/operations/supplier-confirmations`.

## Status axes (for reference)
- `BookingStatus`: draft | confirmed | in_progress | completed | cancelled. **Active** = not cancelled/completed; **operationally live** = confirmed | in_progress.
- Phase (client-derived, fixed order): Critical Issues → Needs Assignment → Needs Confirmation → Ready for Voucher → Operationally Ready.
- Critical in the grid model = **rejected supplier confirmation OR missing operational date/time** (no execution-level ISSUE field on the grid; that lives on dispatch, out of Round-1 grid scope).

## Round-1 build order (remaining slices)
Scaffold ✓ → status map ✓ → read-only invariant test ✓ → phase port + pinning tests ✓ → **shared primitives** (badge, icons, DisabledAction, states) → **Screen 2 board** (consume ops-phase) + manifest/rooming/finance/activity tabs → **Screen 1** (dashboard+dispatch+list) → a11y/empty/error pass → optional nav entry.

## Hard no-go (unchanged)
No backend/schema/new-endpoint/mutation-proxy changes; no POST/PATCH/PUT/DELETE wiring; no supplier emails; no voucher generation/send/download; no finance mutation; no live edits; no document downloads; no Classic route replacement; no second global nav.
