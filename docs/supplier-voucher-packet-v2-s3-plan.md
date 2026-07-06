# Supplier Voucher Packet V2 — S3 (Packet Generate) Plan

**Date:** 2026-07-06
**Status:** Approved plan (documentation only). No code, schema, migration, flag, or
environment change accompanies this document.
**Goal:** persist packets — create `VoucherPacket` + `VoucherPacketItem` rows, snapshot
included services, and write packet-level + per-service audit. **Generate only.** Classic
remains fallback/reference only.

## S3 is generate-only
S3 does **only**: create `VoucherPacket` + `VoucherPacketItem` rows, service snapshots, and
audit. **Not in S3:** PDF, preview, download, send-preview, send, regenerate, stale
handling, **and no delete/discard endpoint**. A delete/discard is a separate lifecycle
mutation and would be its own later slice if needed.

## Overriding safety
Because code **auto-deploys to production** on merge, the S3 write path must be **backend
feature-gated and fail-closed** — the endpoint must be inert in production until the flag is
explicitly set. "Not merged" is **not** a prod safety mechanism here; the fail-closed flag
is.

---

## 1. Backend flag (default OFF, fail-closed)
`OPS_V2_VOUCHER_PACKET_ENABLED` — read `=== 'true'` only; **anything else
(absent/empty/other) = disabled**. Mirror the existing `isOpsV2VoucherSendEnabled` pattern
(`ops-voucher-send-flags.ts`) with an `isOpsV2VoucherPacketEnabled()` helper. The generate
endpoint checks it **first** and returns `403 feature_disabled` when off. Prod receives the
code on merge but writes nothing until this flag is explicitly enabled on prod.

## 2. Frontend flag (unchanged)
`NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET` (default OFF) stays the UI gate for the panel. Any
"Generate packet" affordance renders only when this flag is on **and** the role is
admin/operations. The backend flag independently authorizes the write.

## 3. Route / API shape (generate only)
- `POST /api/bookings/:id/voucher-packets` — body `{ groupingKey }`. Creates the packet +
  items in one transaction; returns the created packet.
- (Optional read) `GET /api/bookings/:id/voucher-packets` — list persisted packets (so the
  panel can show "Generated"). Read-only.
- **Not in S3:** regenerate, PDF, preview/download, send-preview, send, **delete/discard**.

## 4. Server re-runs the S2 grouping engine (does not trust client group data)
Generate flow (transaction):
1. `findOne(id, actor)` → services (read).
2. `computeVoucherPacketGroups(services)` (the S2 engine — authoritative) → find the group
   whose `groupingKey === body.groupingKey`. If none → `404 group_not_found`.
3. Duplicate + double-coverage guards (§5).
4. Snapshot the group + each member service (§6).
5. Create one `VoucherPacket` (status `GENERATED`) + one `VoucherPacketItem` per member.
6. Write audit events (§9).

The client-supplied group is never trusted — the server recomputes from live services, so
the persisted packet matches what the panel showed.

## 5. Duplicate / double-coverage guards (code-enforced — no new constraint in S3)
- **Duplicate packet:** within the transaction, query for an existing `VoucherPacket` with
  the same `(bookingId, groupingKey)`; if found → reject `409 packet_already_generated`
  (regeneration is a later slice). *(A DB unique index on `(bookingId, groupingKey)` is
  ideal but is a migration → deferred; S3 guards in code. Small concurrent-generate race
  mitigated by the transaction + re-check.)*
- **Double-coverage:** reject a `bookingServiceId` already in another `VoucherPacketItem`
  (any packet) **or** already covered by a standalone `Voucher` (1:1
  `Voucher.bookingServiceId`). A service belongs to at most one voucher artifact.
  `VoucherPacketItem`'s `unique(packetId, bookingServiceId)` prevents intra-packet dupes.

## 6. Snapshot JSON shape (PII- & finance-free)
- **Packet `snapshotJson`:** `{ supplierId, supplierName, groupingType, groupingKey,
  bookingRef, dateRange, dayNumbers, serviceCount, generatedAt, services: [{ id,
  serviceType, serviceDate, dayNumber, label }] }`.
- **Item `snapshotJson`:** `{ bookingServiceId, serviceType, operationType, serviceDate,
  dayNumber, label, supplierName }`.
- **`contentHash`:** deterministic hash of the members (e.g. canonical JSON of `{id,
  serviceDate, description, supplierId}`) — set now, used later for stale detection.
- **No** cost/sell/margin, **no** passenger PII (reuse the PR-3-safe name/label formatters).

## 7. `VoucherPacket.status` behavior (S3)
S3 writes **`GENERATED`** only (+ `generatedAt`, `generatedBy`). The schema default `DRAFT`
stays unused (S2 groups are computed, not persisted). `PREVIEWED` / `DOWNLOADED` / `SENT`
are later slices; `STALE` is later. S3 has exactly one write transition: *(compute)* →
`GENERATED`.

## 8. `VoucherPacketItem` inclusion behavior
One row per included (assigned) service — `{ packetId, bookingServiceId, includedAt=now,
snapshotJson }`, `unique(packetId, bookingServiceId)`. The engine already excludes
unassigned services. Inclusion is immutable in S3 (add/remove after generate = a later
regenerate slice).

## 9. Audit events (packet-level + per-service)
`BookingAuditEntityType` has only `{booking, booking_service}` and S3 adds **no migration**,
so:
- **Packet-level:** `entityType='booking'`, `entityId=<packetId>` (a uuid label),
  `action='voucher_packet_generated'`, `newValue="<supplierName> · <TYPE> · N services"`,
  `note` may carry the `groupingKey`.
- **Per-service inclusion:** `entityType='booking_service'`, `entityId=<bookingServiceId>`,
  `action='voucher_packet_service_included'`, `newValue=<packet supplier + type>`.
- All values name/label/count only (reuse the PR-3c-safe formatters) — **no PII, no
  finance**. The dedicated `booking_voucher_packet` enum value stays deferred (avoids an
  `ALTER TYPE … ADD VALUE` migration).

## 10. Keep existing single-service vouchers unchanged
- The `Voucher` model, `generateOperationalVoucher`, and `BookingService.voucherStatus`
  writes are **untouched**. Packets are a parallel table/flow.
- S3 does **not** overload `BookingService.voucherStatus` (owned by the single-service
  flow); packet membership is tracked via `VoucherPacketItem` only.
- The double-coverage guard keeps a service out of both a packet and a standalone voucher.

## 11. Prevent generate / PDF / send confusion
- S3 wires **generate only.** No packet PDF, download, preview, send-preview, or send exists
  after generate. UI (if any) shows status "Generated — PDF & sending coming later," with
  **no** download/send buttons.
- Each future capability is its own slice + own flag; **generate never implies send.** Send
  additionally requires the existing `OPS_V2_VOUCHER_SEND_ENABLED` — **now `false` in
  prod**.

## 12. No delete/discard endpoint in S3
S3 exposes **no** delete/discard route. Removing a packet is a separate lifecycle mutation
for a later slice. For staging validation the generated test packet is **left in place** and
documented; no manual DB cleanup unless explicitly approved.

## 13. Role permissions
`@Roles('admin','operations')` (super_admin via coalescing) on the generate endpoint —
mirrors single-service voucher generate. `agent_admin` / `agent` / `viewer` / `finance`
excluded. Plus the backend `OPS_V2_VOUCHER_PACKET_ENABLED` gate (role alone is
insufficient).

## 14. Tests
- **Pure/service (Prisma-mock):** generate creates **1 `VoucherPacket` (GENERATED)** +
  **N `VoucherPacketItem`s**; snapshot shape; **audit events** (packet + per-service);
  **no PII/finance** in snapshots/audit; **duplicate guard** → 409 on a 2nd generate;
  **double-coverage guard**; unassigned excluded; uses the same engine.
- **Flag/role gating:** `OPS_V2_VOUCHER_PACKET_ENABLED` off → `403` / no writes; wrong role
  → `403`.
- **Isolation:** single-service `Voucher` path + `BookingService.voucherStatus` untouched.
- Endpoint (thin) + FE render (if a button is added): button only when both flags + role; no
  PDF/send controls.

## 15. Staging validation plan
1. Enable `OPS_V2_VOUCHER_PACKET_ENABLED=true` on **staging backend only**;
   `NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET` already true on staging.
2. On BK-2026-0002 (HOTEL group), `POST /voucher-packets { groupingKey: "HOTEL:…" }` →
   confirm **1 `VoucherPacket` (GENERATED) + 1 `VoucherPacketItem`** created (via the list
   read).
3. Confirm audit events (packet + per-service); snapshots PII/finance-free.
4. Confirm **single-service vouchers unchanged**; confirm **duplicate guard** by attempting
   a **second generate** and receiving the expected **409 conflict**; confirm **no
   PDF/send**.
5. Confirm **prod stays inert** — with the prod backend flag OFF, the endpoint 403s
   (fail-closed) even though the code deployed.
6. **Cleanup:** the generated test packet is **left in place** and documented (no
   delete/discard endpoint; no manual DB cleanup unless explicitly approved).
7. **Send remains disabled and allowlist remains `ziad@axisdmc.com` only.**

## 16. Rollback / fallback plan
- **Primary safety:** `OPS_V2_VOUCHER_PACKET_ENABLED` fail-closed → prod gets the code but
  writes nothing until explicitly enabled; setting it back to `false` disables generation
  immediately.
- **Data:** generated packets are benign `GENERATED` rows with no PDF/send wired; removal is
  a future slice (destructive delete needs explicit approval).
- **Schema:** additive S1 tables already exist; S3 adds **no migration** — nothing to roll
  back at the schema level.
- **Isolation:** single-service vouchers + Classic remain the fallback and are unaffected.

---

**Bottom line:** S3 persists packets (`VoucherPacket` + `VoucherPacketItem` + snapshots +
audit) via a **backend-flag-gated, fail-closed** `POST /voucher-packets` that re-uses the S2
engine — **generate only**, no PDF/preview/download/send-preview/send, **no delete/discard**,
no schema change, single-service vouchers untouched. Supplier send stays disabled; the
allowlist remains `ziad@axisdmc.com` only.
