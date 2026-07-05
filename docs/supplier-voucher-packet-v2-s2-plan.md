# Supplier Voucher Packet V2 — S2 (Grouping Engine + Read-only View) Plan

**Date:** 2026-07-06
**Status:** Approved plan (documentation only). No code, schema, migration, flag, or
environment change accompanies this document.
**Goal:** a pure, deterministic packet-grouping engine + a flag-gated **read-only** Ops V2
panel that shows the computed supplier packets, using the S1 tables' concepts but
**writing nothing**. No packet creation, no generate/PDF/send, no migration. Classic
remains fallback/reference only.

## 1. S2 goal
- Pure deterministic **grouping engine** (compute supplier packets from a booking's
  services).
- **Read-only** surface: a computed view of the groups, for validation before S3
  introduces real packet creation.
- **No database writes.** Reads only.

## 2. Explicitly out of scope for S2
No packet creation, **no** `VoucherPacket`/`VoucherPacketItem` writes, no generate, no PDF,
no send-preview, no send, no packet lifecycle mutation, no schema/migration, no
voucher-send/allowlist change, no supplier sending, no production flag change.

## 3. Proposed grouping engine shape (pure)
A pure module — recommended in the **backend** (`apps/api/src/bookings/voucher-packet-grouping.ts`)
because S3 (generate) will need the same engine server-side. I/O-free and unit-tested,
mirroring the existing pure `ops-phase.ts` pattern:

```ts
type PackableService = {
  id: string;
  assignedSupplierId?: string | null;
  assignedSupplierName?: string | null;
  assignmentStatus?: string | null;
  serviceType?: string | null;
  operationType?: string | null;
  serviceDate?: string | null;      // or operationalDate
  bookingDayId?: string | null;
  dayNumber?: number | null;
  nights?: number | null;
  label?: string | null;            // PII-safe display (route/hotel/activity name)
};

export function computeVoucherPacketGroups(services: PackableService[]): VoucherPacketGroup[];
```

- **Filter:** drop services with no assigned supplier — "assigned" =
  `(assignedSupplierId || supplierId)` present **and** `assignmentStatus != 'UNASSIGNED'`
  (the existing `isAssigned` predicate).
- **Classify** each to a grouping dimension from `serviceType`/`operationType` →
  `TRANSPORT | HOTEL | ACTIVITY | GUIDE | MEAL | TICKET | EXTERNAL_PACKAGE` (DINING→MEAL);
  reuse any existing classification helper.
- Deterministic / pure: no `Date.now()`, no randomness; identical input → identical output;
  stable ordering.

## 4. Proposed `VoucherPacketGroup` DTO
```ts
type VoucherPacketGroup = {
  groupingKey: string;
  groupingType: 'TRANSPORT'|'HOTEL'|'ACTIVITY'|'GUIDE'|'MEAL'|'TICKET'|'EXTERNAL_PACKAGE';
  supplierId: string;
  supplierName: string | null;
  serviceIds: string[];
  serviceCount: number;
  dateRange: { start: string | null; end: string | null };
  dayNumbers: number[];
  memberLabels: string[];            // PII-safe (route/hotel/activity names only)
  existingPacketId?: string | null;  // OPTIONAL read from voucher_packets; still no write
};
```
Display-only for S2; `existingPacketId` is optional (may read the currently-empty
`voucher_packets` to annotate, or be omitted). No `status` mutation.

## 5. Grouping rules (deterministic `groupingKey`)
- **Transport:** one packet per supplier across the booking →
  `TRANSPORT:<assignedSupplierId>`.
- **Hotel:** per supplier + stay block → `HOTEL:<supplierId>:<stayStartDate>` (v1 = per
  stay-start date; contiguous multi-row stay merge is a later refinement).
- **Activity / Guide / Meal / Ticket / External:** per supplier + service day →
  `<TYPE>:<supplierId>:<serviceDay>` where `serviceDay = bookingDayId ?? date` (per-supplier
  merge is an option later).
- **Unassigned services are excluded.**
- **Never group across different `assignedSupplierId`** (the key includes the supplier id).
- Stable ordering: groups by `(type, supplierName, key)`, members by `(dayNumber/date, id)`.

## 6. Proposed read-only API endpoint
`GET /api/bookings/:id/voucher-packets/groups` — `@Roles('admin','operations')`. Loads the
booking's services (**DB read only**), runs `computeVoucherPacketGroups`, returns
`VoucherPacketGroup[]`. **No writes; no `VoucherPacket` rows created.** admin-web adds a
**read-only** JSON proxy (`forwardProxyJsonResponse`, `cache: 'no-store'`) mirroring the
existing V2 proxy pattern.

*Alternative (lighter):* if the operations-grid payload already carries every field the
engine needs, do the grouping as a **pure FE function over the already-loaded grid** with
**no new endpoint**. Recommendation: the backend endpoint (authoritative engine, reusable
by S3); still read-only.

## 7. Proposed Ops V2 read-only "Supplier Packets" panel
A flag-gated **read-only** panel on the Ops V2 workspace (Operations tab, near the service
board, or the Documents tab). Renders each computed group — supplier, type badge, member
service labels, date range, day numbers, service count — **display only, no buttons** (no
Generate/Preview/Send in S2). When the flag is OFF, nothing renders. Per-service rows keep
their existing controls unchanged.

## 8. Flag
`NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET` — **default OFF**. Gates the read-only panel only. No
backend behavior is gated in S2 beyond the panel (the read endpoint is inert/read-only).

## 9. Tests to add later
- **Engine unit tests** (node:test, mirroring `ops-phase.test.ts`): transport same-supplier
  merge; hotel per stay-block/supplier; activity/guide/meal/ticket/external per supplier+day;
  **unassigned excluded**; **different suppliers never merged**; deterministic key + stable
  ordering; empty input; null-date fallback; DINING→MEAL classification.
- **Backend endpoint test** (thin): returns groups; read-only (no create/update calls);
  `@Roles` present.
- **admin-web:** source-grep proxy test (JSON forward, not the Classic path) + render test
  for the panel (flag ON → groups shown; flag OFF → nothing; no `<button>`/form; no finance
  keys; PII-safe labels).

## 10. Risks / blockers
1. **Grid field availability** — the engine needs `serviceType`/`operationType`,
   `serviceDate`/`operationalDate`, `bookingDayId`/`dayNumber`, `nights`,
   `assignedSupplierId`+name. The recommended backend endpoint reads these directly from
   `BookingService` (all present), sidestepping any grid-projection gap. (FE-only would need
   the grid to carry them; if not, extend the read projection — read-only, no migration.)
2. **Classification source of truth** — `serviceType` (String) vs `operationType`; need one
   canonical mapping; reuse an existing classify helper to avoid drift.
3. **Hotel stay-block contiguity** — v1 keys per stay-start date; contiguous multi-row stay
   merge is a later refinement.
4. **Same supplier, multiple types/days** — intentionally separate packets (key includes
   type + day).
5. **PII-safety** — member labels are name/route/hotel only (reuse PR-3-safe formatting); no
   passport/DOB/finance in the DTO or panel.
6. **Determinism** — stable sort, no time/random; null dates fall back to id ordering.
7. **`existingPacketId` read (optional)** — a read of the currently-empty `voucher_packets`
   table; harmless; kept optional to stay minimal.

## 11. Confirmation — S2 is code-only / no migration
✅ Pure engine + read-only endpoint/proxy + flag-gated read-only panel + tests.
❌ **No files under `apps/api/prisma/migrations/`**, ❌ no schema change, ❌ no DB writes,
❌ no packet creation/lifecycle, ❌ no generate/PDF/send/send-preview, ❌ no
voucher-send/allowlist change, ❌ no supplier send, ❌ no production flag change. Because S2
adds **no migration**, merging it will **not** re-trigger a production schema apply (per the
deployment/migration governance note) — the guard is **zero files under
`apps/api/prisma/migrations/`**. Classic remains fallback/reference.

---

**Bottom line:** S2 is a **pure deterministic grouping engine** (backend, unit-tested) + a
**read-only** `GET :id/voucher-packets/groups` endpoint + a **flag-gated read-only**
"Supplier packets" panel — reads only, writes nothing, no migration, no send. It makes the
packet groupings **visible** for validation before S3 introduces actual packet creation.
