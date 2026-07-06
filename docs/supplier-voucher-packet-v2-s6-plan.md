# Supplier Voucher Packet V2 — S6 (Stale Detection + Regenerate) Plan

**Status:** Planning only. No code, schema, migration, flag, or environment change
accompanies this document.
**Scope:** Detect when a generated voucher packet is **stale** (its included services
changed) and let operators **regenerate** the packet snapshot/PDF safely.
**References:** `docs/supplier-voucher-packet-v2-plan.md`,
`docs/supplier-voucher-packet-v2-s3-plan.md`,
`docs/supplier-voucher-packet-v2-s3-staging-validation.md`,
`docs/supplier-voucher-packet-v2-s4-plan.md`,
`docs/supplier-voucher-packet-v2-s5-plan.md`,
`docs/supplier-voucher-packet-v2-s5-staging-validation.md`.

---

## 0. Decisions locked for S6

1. **Stale detection is read-only / computed.**
   - `isStale` is computed by comparing the **current** group's `contentHash` against the
     **stored** `packet.contentHash`.
   - **`STALE` status is not persisted** in S6.
   - **No `voucher_packet_marked_stale` audit event** is written.
   - Packet `status` remains **`GENERATED`** until an operator regenerates.

2. **Keep the existing S3 `contentHash` field set — unchanged.**
   - Hash fields remain exactly: `id`, `serviceDate`, `label`, `supplierId`.
   - **`serviceType` is not added** to the hash in S6.
   - Membership changes, supplier reassignment, and group missing/orphaned state are all
     still detected (see §4).
   - Any future change to the hash field set is a deliberate, separate reset/migration
     decision — out of scope here.

3. **S6 remains stale detection + regenerate only.**
   - No send. No send-preview. No email. No allowlist change.
   - No schema/migration. No delete/discard.
   - No lifecycle `DOWNLOADED` / `SENT` tracking.
   - Production remains fail-closed. Classic remains fallback/reference only.

---

## 1. Current `contentHash` behavior (from S3)

`computeVoucherPacketContentHash(members)` (in
`apps/api/src/bookings/voucher-packet-generate.ts`) produces a sha256 hex digest of a
canonical, **id-sorted, order-independent** JSON array where each member contributes
`{ id, serviceDate, label, supplierId }` (`label` = the service description). It is stored
on `VoucherPacket.contentHash` at generation time and, prior to S6, was **set but never
compared**. S6 makes it the authoritative stale anchor. The same function is reused for the
stale check to guarantee determinism (the hash computed at generation and at check time must
be byte-identical for equal inputs).

## 2. Current packet + item snapshots (from S3)

- `VoucherPacket.snapshotJson` — supplier, grouping type, grouping key, booking ref, date
  range, day numbers, service count, and `services[{ id, serviceType, serviceDate,
  dayNumber, label }]`. PII/finance-free by construction.
- `VoucherPacketItem.snapshotJson` — per-member service snapshot (identity/date/label).
  One row per included `bookingServiceId`, unique on `(packetId, bookingServiceId)`.

The PDF (S4) renders from these snapshots, so only fields that appear in the snapshot /
hash affect what a supplier sees.

## 3. Which service changes should make a packet stale

A packet is stale when the **current** computed group (found by its `groupingKey`) diverges
from what was captured at generation:

- A member's **hashed field changes** — `serviceDate`, `description` (label), or
  `assignedSupplierId`.
- A **service is added** to the group (newly assigned to the same supplier for the same
  stay/day) → the packet is missing it.
- A **service is removed** — unassigned, deleted, or reassigned to a different supplier.
- **Supplier reassignment** of a member.
- The **group no longer exists** (supplier fully unassigned / no remaining services) →
  orphaned.

**Not** stale-triggering: changes to fields that are neither in the hash nor part of
grouping (e.g. operational notes). The supplier-facing PDF renders identity/date/label from
the snapshot, so only hashed/grouping fields matter. Per Decision 2, `serviceType` is **not**
part of the hash in S6; a `serviceType` change that keeps the same `groupingKey` and the same
hashed fields will not trip stale. (If a `serviceType` change moves the service into a
different group, the old group loses the member → membership change → stale.)

## 4. How to detect stale (single authoritative check)

For each generated packet:

1. Re-run the S2 grouping engine (`computeVoucherPacketGroups`) over the booking's **live**
   services.
2. Find the group whose `groupingKey` equals `packet.groupingKey`.
   - **Group not found** → **stale (orphaned)**.
3. Recompute that group's `contentHash` with `computeVoucherPacketContentHash`.
4. Compare to the stored `packet.contentHash`:
   - **Mismatch → stale.**
   - **Match → not stale.**

Because the hash includes member `id`s plus each member's hashed fields, a single
`contentHash` comparison over the current group's members captures **all** of: field change,
add, remove, and supplier reassignment. Notes:

- **`member.updatedAt > packet.generatedAt`** may be used only as a **cheap pre-filter** —
  it over-fires on non-hashed changes, so it never decides on its own. The `contentHash`
  comparison is the source of truth.
- **Grouping-key-shifting edits** (e.g. a hotel `serviceDate` change, where the key embeds
  the date): the old key's group disappears → the packet keyed to the old key is stale
  (orphaned), and a new group under the new key exists but has no packet (ungenerated).
  Both outcomes are correct and surfaced by the same check.

## 5. Read-only vs persisted → **read-only (computed)**

`isStale` is computed on the fly in the **existing S2 groups-endpoint enrichment**, alongside
`existingPacketId` / `packetStatus`, and **only when `OPS_V2_VOUCHER_PACKET_ENABLED` is ON**
(fail-closed; nothing exposed when the flag is off). Concretely: for each group that has an
`existingPacketId`, add a computed `isStale: boolean`.

- **No write.** No `status='STALE'` persisted, no background job, no mark-stale audit.
- The packet `status` stays `GENERATED` until an operator explicitly regenerates.
- The **regenerate action is the only write** introduced by S6.

Trade-off recorded: persisting a `STALE` status would require a mutation (and likely a
background reconciler) to keep it accurate as services change. Read-only computation is
simpler, always accurate at read time, and keeps detection side-effect-free — chosen for S6.

## 6. Regenerate route shape

`POST /bookings/:id/voucher-packets/:packetId/regenerate`

- **Backend flag-gated** by `OPS_V2_VOUCHER_PACKET_ENABLED` (strict `=== 'true'`, checked
  **first**, fail-closed → `403 feature_disabled` when off).
- `@Roles('admin','operations')` (super_admin via role coalescing). Same authority as the
  S3 generate route.
- Admin-web JSON proxy mirrors the S3 generate proxy (POST, session-forwarding, no redirect).
- Updates the **existing** packet row (same `packetId`) and replaces its items — no new
  packet is created.

## 7. Regenerate behavior

In a single transaction:

1. **Flag check** (fail-closed) → load the packet by `(bookingId, packetId)`, company-scoped;
   `404` if missing.
2. Re-run `computeVoucherPacketGroups` over live services → find the group with
   `packet.groupingKey`.
   - **Group missing (orphaned)** → reject (`409 packet_group_no_longer_exists`). The
     operator must reassign services or delete the packet (delete is a later slice). No
     status write occurs.
3. **Double-coverage guard** (see §8).
4. Rebuild: `packet.snapshotJson`, each `VoucherPacketItem.snapshotJson`, and a fresh
   `packet.contentHash`; set `generatedAt = now`, `generatedBy = actor`.
5. **Replace items in place** — delete this packet's existing `VoucherPacketItem` rows and
   create rows for the current members. **Same `packetId` is kept.**
6. **`status` remains `GENERATED`** — regenerate refreshes the snapshot; it does not
   transition status.
7. Write audit events (§10). Return the updated packet.

Net effect: the packet snapshot, items, and `contentHash` are rebuilt to match the current
grouping, the packet id is preserved, and `isStale` returns to `false` on the next read.

## 8. Duplicate / double-coverage rules during regenerate

- **No duplicate concern** — regenerate updates the existing packet rather than creating a
  new one, so the `(bookingId, groupingKey)` uniqueness is inherently preserved.
- **Double-coverage** — for each current member, verify it is **not** already covered by
  **another** packet and has **no** standalone `Voucher`. The check **excludes this packet's
  own items** (a member being in the packet we are regenerating is expected). Conflict →
  `409` (mirrors the S3 generate double-coverage guard).

## 9. UI behavior

- **Stale badge** — the Supplier Packets panel shows a "Stale — needs regenerate" badge on
  groups whose enriched `isStale` is `true`.
- **Regenerate button** — for stale generated packets, a "Regenerate" control that POSTs to
  the regenerate proxy and refreshes. This is the **first mutation control** in the packet
  panel, so the affordance (or a thin wrapper) becomes a small **client component**,
  flag- and role-gated.
- **Download PDF** remains (S5); after a regenerate it serves the refreshed snapshot.
- **No Send button, no send-preview, no email, no inline preview** — unchanged from S5.

## 10. Audit events

- **`voucher_packet_regenerated`** — packet-level (`entityType='booking'`,
  `entityId=packetId`), on successful regenerate.
- **Per-service inclusion deltas (optional but recommended)** —
  `voucher_packet_service_included` for newly added members and
  `voucher_packet_service_removed` for dropped members (`entityType='booking_service'`).
  Name/label-only; PII/finance-free.
- **No `voucher_packet_marked_stale`** — stale is read-only/not persisted (Decision 1), so
  there is no mark-stale write and therefore no such audit event. Only regenerate writes
  audit.

(As in prior slices, packet-scoped audit uses `entityType='booking'` with `packetId` as the
entity id; the `booking_voucher_packet` enum value remains deferred — no enum migration.)

## 11. Role permissions

- **Regenerate:** `@Roles('admin','operations')` (super_admin via coalescing;
  `agent_admin` and other roles excluded) **plus** the backend flag.
- **Stale detection:** follows the same read gates as the S2 groups endpoint; exposed only
  when `OPS_V2_VOUCHER_PACKET_ENABLED` is ON.

## 12. Tests

- **Stale detection (service, read-only):** current-group hash matching stored → `isStale
  false`; a mutated member (date/label/supplier) → `isStale true`; added member → stale;
  removed member → stale; group missing → stale/orphaned; flag OFF → `isStale` not exposed;
  mutation traps prove no writes.
- **Regenerate (service, Prisma-mock):** flag OFF → `403`, no write; success updates the
  packet (new `contentHash`, snapshots, `generatedAt`) and **replaces items** (delete +
  create); audits `voucher_packet_regenerated`; **same `packetId`**; **`status` stays
  `GENERATED`**; orphaned group → `409`; double-coverage → `409`.
- **Enrichment (service):** groups endpoint returns `isStale` per generated group,
  flag-gated, read-only.
- **UI render:** panel shows the Stale badge + Regenerate control for stale packets; no
  Send/send-preview; not-stale packets show no Regenerate; Regenerate posts to the proxy.
- **Proxy source-grep:** regenerate proxy is POST, JSON forward, backend-flag-reliant, no
  redirect; the S5 GET PDF proxy and groups proxy remain read-only.

## 13. Staging validation plan (packet `f32d6acf-17aa-490b-94b7-c4f4bac426a0`)

The staging packet is currently **not** stale, so validation requires a **controlled,
reversible** staging data change:

1. Confirm `isStale = false` for the HOTEL group (BK-2026-0002) initially.
2. **Mutate a member service field on staging** (e.g. the hotel service's `description` or
   `serviceDate`, via the existing service-edit path) → confirm the groups endpoint now
   reports **`isStale = true`** and the panel shows the **Stale badge + Regenerate**.
3. **Regenerate** → confirm `200`, **same `packetId`**, updated
   `contentHash`/`snapshotJson`/`generatedAt`, `status` still **`GENERATED`**, audit
   `voucher_packet_regenerated`, and `isStale` back to **false**.
4. Confirm the **Download PDF** now reflects the change.
5. **Restore** the mutated field and re-regenerate so BK-2026-0002 ends on a clean baseline
   (the exact revert steps to be fixed at validation time).
6. Confirm **no send/email**, **production fail-closed** (flag unset), and the voucher-send
   **allowlist unchanged**.

(Exact staging edit/revert mechanics are confirmed at S6-validation time; the essence is a
reversible member-field change to trip stale, then regenerate, then restore.)

## 14. Rollback / fallback plan

- **Flag OFF** → regenerate disabled (fail-closed `403`); stale detection exposes nothing
  (read-only, harmless). Production stays inert.
- **Regenerate is in-place** — it **overwrites** the packet snapshot; there is **no version
  history** in S6 (recorded as a known limitation). To recover from an undesired regenerate,
  regenerate again against the current data.
- **Schema additive / none** — S6 adds **no migration**; it uses existing columns
  (`contentHash`, `snapshotJson`, `generatedAt`, `generatedBy`) and the existing item table.
  Nothing to roll back at the schema level.
- Single-service `Voucher` rows and Classic vouchers are unaffected.

## 15. Risks

1. **Hash field coverage (by design).** Stale fires only for changes in the hashed set
   (`id`, `serviceDate`, `label`, `supplierId`) plus membership. Per Decision 2 the field set
   is unchanged; a `serviceType`-only change that keeps the same group and hashed fields will
   not trip stale. Changing the hash function retroactively would make **all** existing
   packets read as stale (their stored hash used the old field set), so any future field-set
   change is a deliberate, separate reset — not part of S6.
2. **Orphaned groups.** Supplier fully unassigned → regenerate cannot proceed; must return a
   clear `409` (delete is a later slice).
3. **First UI mutation.** The Regenerate button makes the panel partly interactive; it must
   stay flag- and role-gated and post through the session-forwarding proxy.
4. **Snapshot overwrite / no history.** Regenerate replaces the snapshot; versioning is
   future work if needed.
5. **Double-coverage on regenerate.** Must exclude the packet's own items from the
   "already covered elsewhere" check to avoid a false conflict.
6. **Determinism.** Stale-check and generation must use the identical
   `computeVoucherPacketContentHash`; any drift yields false positives/negatives.
7. **Production safety.** No env/flag change; both packet flags stay off in prod; regenerate
   (a write) is fail-closed behind `OPS_V2_VOUCHER_PACKET_ENABLED`.

---

## Summary

S6 adds **read-only stale detection** — recompute the current group's `contentHash` and
compare it to the stored `packet.contentHash`, surfacing a flag-gated `isStale` on the S2
groups endpoint and a panel badge — and a **flag-gated, fail-closed
`POST …/voucher-packets/:packetId/regenerate`** that rebuilds the packet snapshot, items, and
`contentHash` **in place** (same `packetId`, `status` stays `GENERATED`, audited). **No
`STALE` persistence, no mark-stale audit, no send/send-preview/email, no allowlist change, no
schema/migration, no delete.** Production remains fail-closed; Classic remains
fallback/reference only.
